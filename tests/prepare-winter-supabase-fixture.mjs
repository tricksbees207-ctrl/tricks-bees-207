// Prepare a schema-only, synthetic Winter fixture for a genuine local Supabase DB.
// The older PostgreSQL fixture creates stand-in auth roles and functions, whereas
// Supabase CLI supplies its own auth schema, roles, auth.uid() and auth.jwt().
import fs from 'node:fs';
import assert from 'node:assert/strict';

const input=fs.readFileSync('tests/winter-migration-fixture.sql','utf8');
const marker='CREATE TABLE public."Apiary_Activities"';
const start=input.indexOf(marker);
assert(start>0,'Expected production-shaped fixture table marker');
const prefix=input.slice(0,start);
assert(prefix.includes('CREATE ROLE authenticated NOLOGIN;'),'Expected mock role prelude');
assert(prefix.includes('CREATE TABLE auth.users (id uuid PRIMARY KEY);'),'Expected mock user prelude');
assert(prefix.includes('CREATE FUNCTION auth.uid()'),'Expected mock auth function');
assert(prefix.includes('CREATE FUNCTION auth.jwt()'),'Expected mock JWT function');
const sql='-- Runs ONLY on disposable local Supabase Auth/Postgres. No mock auth objects.\n'+input.slice(start);
assert.equal(sql.split('CREATE TABLE public.').length-1,19,'Fixture must contain exactly 19 production-derived public tables');
assert(sql.includes('INSERT INTO auth.users (id) VALUES'),'Synthetic users required for owner checks');
assert(!sql.includes('CREATE ROLE'),'Supabase roles must remain native');
assert(!sql.includes('CREATE FUNCTION auth.uid()'),'Native Supabase auth must remain unchanged');
const path=process.argv[2];
assert(path,'Output filename required');
fs.writeFileSync(path,sql);
console.log('Prepared 19-table schema-only Supabase fixture with synthetic owners and deliberately wrong-hive rows.');
