-- Solo tablas internas de OrganizaT. No modifica tablas de otras aplicaciones.
-- Ejecutar como propietario de las tablas o como administrador de PostgreSQL.
-- El acceso de usuarios pasa por Node; no se crean políticas públicas permisivas.
BEGIN;

-- Evita activar una configuración que impida trabajar al servidor de Node.
DO $backend_access$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'authenticator') OR EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_roles AS r ON r.rolname = current_user
    WHERE n.nspname = 'public'
      AND c.relname IN ('organizers', 'organizer_sessions', 'password_reset_codes', 'invitation_events', 'push_subscriptions')
      AND NOT (r.rolsuper OR r.rolbypassrls
        OR (NOT c.relforcerowsecurity AND pg_has_role(current_user, c.relowner, 'USAGE')))
  ) THEN
    RAISE EXCEPTION 'La conexión del servidor debe ser propietaria de las tablas o tener BYPASSRLS. No uses los roles públicos de PostgREST como conexión de Node.';
  END IF;
END;
$backend_access$;

ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS no protege operaciones como TRUNCATE: retiramos también los privilegios.
REVOKE ALL PRIVILEGES ON TABLE public.organizers, public.organizer_sessions,
  public.password_reset_codes, public.invitation_events, public.push_subscriptions FROM PUBLIC;

-- Estos roles existen en Supabase, pero no necesariamente en PostgreSQL local.
DO $api_roles$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.organizers, public.organizer_sessions, public.password_reset_codes, public.invitation_events, public.push_subscriptions FROM %I', api_role);
      IF to_regclass('public.password_reset_codes_id_seq') IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.password_reset_codes_id_seq FROM %I', api_role);
      END IF;
    END IF;
  END LOOP;
  IF to_regclass('public.password_reset_codes_id_seq') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON SEQUENCE public.password_reset_codes_id_seq FROM PUBLIC;
  END IF;
END;
$api_roles$;

COMMIT;
