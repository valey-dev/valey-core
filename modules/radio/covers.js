// The uri of a wave -> the cover already downloaded, so as not to pull Spotify on
// every visit. A file of its own, because the cache outlives a reload of the route
// and must not be recreated along with it.
export const covers = new Map();
