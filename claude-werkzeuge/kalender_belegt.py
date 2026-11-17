#!/usr/bin/env python3
"""Belegte Zeiten aus Saschas iCloud-Kalendern (und optional dem Unterrichts-Feed) anzeigen.

Nutzung: python3 claude-werkzeuge/kalender_belegt.py 20261118T000000Z 20261204T000000Z
Zeiten in UTC, Ausgabe in Berliner Zeit. "frei" = Termin ist als verfügbar markiert (TRANSP:TRANSPARENT).

- iCloud: Zugangsdaten setzt der Proxy als Network Secret ein (caldav.icloud.com und p1xx-caldav.icloud.com).
  Die Kalender werden automatisch gefunden, es stehen keine IDs in diesem öffentlichen Repository.
- Unterricht (My Music Staff): Feed-URL ist geheim und steht NIE im Repository. Sie wird aus der
  Umgebungsvariable MMS_ICS_URL oder der Datei ~/.mms-url gelesen; fehlt beides, wird der Unterricht übersprungen.
"""
import os, re, subprocess, sys, datetime as dt
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Berlin")


def curl(*args):
    return subprocess.run(["curl", "-s", *args], capture_output=True, text=True).stdout


def propfind(url, prop, depth="0"):
    body = f'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>{prop}</d:prop></d:propfind>'
    return curl("-X", "PROPFIND", url, "-H", f"Depth: {depth}", "-H", "Content-Type: application/xml", "-d", body)


def hrefs(xml):
    return re.findall(r"<href[^>]*>([^<]*)</href>", xml)


def calendars():
    principal = [h for h in hrefs(propfind("https://caldav.icloud.com/", "<d:current-user-principal/>")) if "principal" in h][0]
    home = [h for h in hrefs(propfind("https://caldav.icloud.com" + principal, "<c:calendar-home-set/>")) if "calendars" in h][0]
    home = home.replace(":443", "")
    xml = propfind(home, "<d:displayname/><d:resourcetype/>", depth="1")
    out = []
    for resp in re.findall(r"<response[^>]*>(.*?)</response>", xml, re.S):
        if "calendar" not in resp.split("resourcetype", 1)[-1]:
            continue
        h = hrefs(resp)[0]
        name = re.search(r"<displayname[^>]*>([^<]*)</displayname>", resp)
        if h.rstrip("/").endswith(("inbox", "outbox", "notification")):
            continue
        base = re.match(r"https://[^/]+", home).group(0)
        out.append((name.group(1) if name else h, h if h.startswith("http") else base + h))
    return out


def parse(v, params):
    if "VALUE=DATE" in params and "T" not in v:
        return dt.datetime.strptime(v[:8], "%Y%m%d").replace(tzinfo=TZ), True
    if v.endswith("Z"):
        return dt.datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc).astimezone(TZ), False
    m = re.search(r"TZID=([^;:]+)", params)
    z = ZoneInfo(m.group(1)) if m else TZ
    return dt.datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=z).astimezone(TZ), False


def events(text, name, lo=None, hi=None):
    text = re.sub(r"\r?\n[ \t]", "", text.replace("&#13;", "").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"))
    for ev in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        if "STATUS:CANCELLED" in ev:
            continue
        s = re.search(r"^DTSTART([^:]*):(\S+)", ev, re.M)
        e = re.search(r"^DTEND([^:]*):(\S+)", ev, re.M)
        if not s:
            continue
        a, allday = parse(s.group(2), s.group(1))
        b = parse(e.group(2), e.group(1))[0] if e else a + dt.timedelta(hours=1)
        if lo and (b <= lo or a >= hi):
            continue
        yield a, b, name, allday, "TRANSP:TRANSPARENT" in ev


def main():
    start, end = sys.argv[1], sys.argv[2]
    query = f'<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data><c:expand start="{start}" end="{end}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="{start}" end="{end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>'
    out = []
    for name, url in calendars():
        xml = curl("-X", "REPORT", url, "-H", "Depth: 1", "-H", "Content-Type: application/xml", "-d", query)
        out += list(events(xml, name))
    mms = os.environ.get("MMS_ICS_URL") or (open(os.path.expanduser("~/.mms-url")).read().strip() if os.path.exists(os.path.expanduser("~/.mms-url")) else "")
    if mms:
        lo = dt.datetime.strptime(start, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
        hi = dt.datetime.strptime(end, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
        out += list(set(events(curl(mms), "UNTERRICHT", lo, hi)))
    else:
        print("(Unterricht nicht geprüft: MMS_ICS_URL bzw. ~/.mms-url fehlt, Sascha nach dem Feed-Link fragen)")
    for a, b, n, allday, free in sorted(out):
        print(a.strftime("%a %d.%m. %H:%M"), "-", b.strftime("%d.%m. %H:%M"), n, "GANZTAG" if allday else "", "frei" if free else "")


if __name__ == "__main__":
    main()
