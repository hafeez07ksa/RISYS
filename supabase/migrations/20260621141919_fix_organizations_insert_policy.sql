
-- Remove the overly permissive duplicate INSERT policy on organizations
-- "orgs_insert" with WITH CHECK: true allows any authenticated user to insert any org
DROP POLICY IF EXISTS "orgs_insert" ON organizations;

-- Keep "org_insert" which correctly requires authenticated role
-- Verify it exists
SELECT policyname, with_check FROM pg_policies 
WHERE tablename = 'organizations' AND cmd = 'INSERT';
;
