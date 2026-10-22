/** Build navigation from the server-owned taxonomy; never manufacture categories. */
export function categoriesForSpecies(categories, speciesId) {
  const byId = new Map(categories.map(category => [category.id,category]));
  const visible = new Set();
  for (const category of categories) {
    if (speciesId && !category.species.includes(speciesId)) continue;
    let current = category;
    const visited = new Set();
    while (current && !visited.has(current.id)) { visited.add(current.id); visible.add(current.id); current = byId.get(current.parentId); }
  }
  return categories.filter(category => visible.has(category.id));
}

export function categoryNavigation(categories, speciesId, selectedSlug) {
  const available = categoriesForSpecies(categories, speciesId);
  const byId = new Map(available.map(category => [category.id, category]));
  const selected = available.find(category => category.slug === selectedSlug) ?? null;
  const breadcrumbs = [];
  let parent = selected;
  const visited = new Set();
  while (parent && !visited.has(parent.id)) { visited.add(parent.id); breadcrumbs.unshift(parent); parent = byId.get(parent.parentId); }
  const children = selected ? available.filter(category => category.parentId === selected.id) : [];
  return { roots: available.filter(category => !category.parentId), children: children.length ? children : selected?.parentId ? available.filter(category => category.parentId === selected.parentId) : [], breadcrumbs };
}
