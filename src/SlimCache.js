class SlimCache {
  constructor(ttl = 1000 * 60 * 5) {
    this.ttl = ttl;

    this._ = {};
    this._.map = new Map();
  }

  set(key, value, ttl = this.ttl) {
    if (ttl === 0) return;

    const item = this._.map.get(key) || {};

    if (item.cancelExpiration) {
      item.cancelExpiration();
    }

    item.expire = () => this._.map.delete(key);

    if (ttl > -1) {
      item.timeoutId = setTimeout(item.expire, ttl);
      item.cancelExpiration = () => clearTimeout(item.timeoutId);
    }

    item.value = value;

    this._.map.set(key, item);
  }

  get(key) {
    const item = this._.map.get(key);

    if (!item) return undefined;

    return item.value;
  }

  delete(key) {
    const item = this._.map.get(key);

    if (!item) return;

    item.expire();
  }
}

module.exports = SlimCache;
