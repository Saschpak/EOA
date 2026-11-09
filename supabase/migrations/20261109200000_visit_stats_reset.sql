-- Coach darf die Besuchszählung zurücksetzen (z. B. eigene Testbesuche entfernen)
create policy "visit_stats: coach löscht" on public.visit_stats
  for delete to authenticated using (public.is_coach());
grant delete on public.visit_stats to authenticated;
