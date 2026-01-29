let latestBlogsCache = null;
let lastFetch = 0;
const TTL = 1000 * 60 * 5; // 5 minutes

export const getLatestBlogsCache = () => {
  if (!latestBlogsCache) return null;
  if (Date.now() - lastFetch > TTL) return null;
  return latestBlogsCache;
};

export const setLatestBlogsCache = (blogs) => {
  latestBlogsCache = blogs;
  lastFetch = Date.now();
};

export const clearLatestBlogsCache = () => {
  latestBlogsCache = null;
};
