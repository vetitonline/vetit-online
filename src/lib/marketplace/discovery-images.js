// Existing editorial assets only; these are never substituted for seller photos.
const assets = Object.freeze({
  dog:'dog', dogs:'dog', cat:'cat', cats:'cat', bird:'bird', birds:'bird',
  fish:'fish', cattle:'livestock', livestock:'livestock', essentials:'essentials',
});
export function discoveryImagePath(slug) {
  const key = typeof slug === 'string' && Object.hasOwn(assets, slug) ? assets[slug] : 'essentials';
  return `/images/discovery/${key}.webp`;
}

/** Use admin species assignments, including descendants, for editorial art.
 * Mixed/unknown categories keep neutral art; these are never seller photos. */
export function categoryDiscoveryArt(category, categories, animals) {
  const ids = new Set([category.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of categories) {
      if (ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; }
    }
  }
  const species = new Set(categories.filter(item => ids.has(item.id)).flatMap(item => item.species));
  if (species.size !== 1) return 'essentials';
  return animals.find(item => species.has(item.id))?.slug ?? 'essentials';
}
