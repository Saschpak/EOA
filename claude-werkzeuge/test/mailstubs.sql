create schema extensions; create schema net; create schema vault;
create table net._http_response(id bigint primary key, status_code int, content text, error_msg text, timed_out bool, created timestamptz default now());
create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.calls(url,body,headers) values(url,body,headers) returning id $$;
create table vault.secrets(id uuid default gen_random_uuid(), name text, decrypted_secret text);
create function vault.create_secret(s text, n text default null, d text default null) returns uuid language sql as $$ insert into vault.secrets(name,decrypted_secret) values (n,s) returning id $$;
create function vault.update_secret(i uuid, s text default null, n text default null, d text default null) returns void language sql as $$ update vault.secrets set decrypted_secret=coalesce(s,decrypted_secret) where id=i $$;
create view vault.decrypted_secrets as select * from vault.secrets;
