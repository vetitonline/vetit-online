// Existing editorial assets only; these are never substituted for seller photos.
const assets = Object.freeze({
  dog:'dog', dogs:'dog', cat:'cat', cats:'cat', bird:'bird', birds:'bird',
  fish:'fish', cattle:'livestock', livestock:'livestock', essentials:'essentials',
});
export function discoveryImagePath(slug) {
  const key = typeof slug === 'string' && Object.hasOwn(assets, slug) ? assets[slug] : 'essentials';
  return `/images/discovery/${key}.webp`;
}
