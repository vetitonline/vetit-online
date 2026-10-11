-- TEST PROJECT ONLY. This file creates taxonomy/market fixtures, no users,
-- businesses, products, prices, customer data, or Auth metadata.
-- Deterministic Vetit test IDs make integration environment values reproducible.

begin;

insert into public.markets (country_code, currency_code, market_status, locale, timezone)
values ('IN', 'INR', 'active', 'en-IN', 'Asia/Kolkata')
on conflict (country_code) do nothing;

insert into public.animal_species (id, parent_id, slug, display_name, is_active) values
  ('90000000-0000-4000-8000-000000000001', null, 'dogs', 'Dogs', true),
  ('90000000-0000-4000-8000-000000000002', null, 'cats', 'Cats', true),
  ('90000000-0000-4000-8000-000000000003', null, 'cattle', 'Livestock & Cattle', true)
on conflict (id) do nothing;

insert into public.categories (id, parent_id, name, slug, kind, moderation_status, sort_order) values
  ('90000000-0000-4000-8000-000000000010', null, 'Pet Food & Treats', 'pet-food-treats', 'product', 'active', 10),
  ('90000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000010', 'Dog Food', 'dog-food', 'product', 'active', 11),
  ('90000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000010', 'Cat Food', 'cat-food', 'product', 'active', 12),
  ('90000000-0000-4000-8000-000000000013', null, 'Livestock Feed & Nutrition', 'livestock-feed', 'product', 'active', 20)
on conflict (id) do nothing;

insert into public.category_species (category_id, species_id) values
  ('90000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000002'),
  ('90000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000003')
on conflict (category_id, species_id) do nothing;

do $$
begin
  if not exists (select 1 from public.markets where country_code = 'IN' and currency_code = 'INR' and market_status = 'active') then
    raise exception 'IN/INR test market fixture conflicts with existing test data; inspect before continuing.';
  end if;
  if (select count(*) from public.animal_species where (id, slug, display_name, parent_id, is_active) in (
      ('90000000-0000-4000-8000-000000000001','dogs','Dogs',null,true),
      ('90000000-0000-4000-8000-000000000002','cats','Cats',null,true),
      ('90000000-0000-4000-8000-000000000003','cattle','Livestock & Cattle',null,true))) <> 3 then
    raise exception 'Vetit test species IDs already contain incompatible data.';
  end if;
  if (select count(*) from public.categories where (id, parent_id, name, slug, kind, moderation_status, sort_order) in (
      ('90000000-0000-4000-8000-000000000010',null,'Pet Food & Treats','pet-food-treats','product','active',10),
      ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000010','Dog Food','dog-food','product','active',11),
      ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000010','Cat Food','cat-food','product','active',12),
      ('90000000-0000-4000-8000-000000000013',null,'Livestock Feed & Nutrition','livestock-feed','product','active',20))) <> 4 then
    raise exception 'Vetit test category IDs already contain incompatible data.';
  end if;
  if (select count(*) from public.category_species where (category_id, species_id) in (
      ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000001'),
      ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000002'),
      ('90000000-0000-4000-8000-000000000013','90000000-0000-4000-8000-000000000003'))) <> 3 then
    raise exception 'Vetit test category/species links are incomplete.';
  end if;
end;
$$;

commit;
