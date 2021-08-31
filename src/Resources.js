const { FS, Path } = require('fs-simple');

const SlimCache = require('./SlimCache');

class Resources {
  constructor(root, config = {}) {
    this.root = root;

    this._ = {};

    this._.cache = new SlimCache(0);
    this._.ttl = config.ttl || 0;

    this._.cacheables = [];

    for (let i = 0; i < config.cacheables.length; i++) {
      let cacheable = config.cacheables[i];

      cacheable = Path.from(cacheable).prefix(this.root);

      this._.cacheables.push(cacheable);
    }

    this._.shouldCache = path => {
      for (let i = 0; i < this._.cacheables.length; i++) {
        const cacheroute = this._.cacheables[i];

        if (path.is(cacheroute) || path.inside(cacheroute)) {
          return true;
        }
      }

      return false;
    };
  }

  static async from(root, { cacheables = [], ttl = 0 } = {}) {
    root = Path.from(root);

    const stat = await FS.stat(root);

    if (!stat.isDirectory()) {
      throw new Error(`The provided root path (${root.path}) for resources must be a directory.`);
    }

    return new Resources(root, { cacheables, ttl });
  }

  async get(path, parser) {
    path = Path.from(path);

    if (!path.inside(this.root)) {
      path.prefix(this.root);
    }

    if (!path.inside(this.root)) {
      throw new Error(`You can not access resources outside of the root folder.`);
    }

    const cachedData = this._.cache.get(path.absolute);

    if (cachedData) {
      return cachedData;
    }

    if (!(await FS.isAccessible(path))) {
      throw new Error(`The resource you're trying to access either does not exist or is not accessible.`);
    }

    const content = await FS.read(path);

    let data = content;

    if (typeof parser === 'function') {
      data = parser(data);
    }

    if (this._.shouldCache(path)) {
      this._.cache.set(path.absolute, data, this._.ttl);
    }

    return data;
  }

  async find(path, parser, searcher) {
    if (typeof parser === 'function' && searcher === undefined) {
      searcher = parser;
      parser = undefined;
    }

    if (typeof searcher !== 'function') {
      throw new Error('In order to search through resources, you need to provide a "searcher" function.');
    }

    path = Path.from(path).prefix(this.root);

    if (!path.is(this.root) && !path.inside(this.root)) {
      throw new Error(`You can not access resources outside of the root folder.`);
    }

    if (!(await FS.isAccessible(path))) {
      throw new Error(`The resources you're trying to access either does not exist or is not accessible.`);
    }

    const tree = await FS.tree(path);
    const files = FS.tree.files(tree);

    const dataPromises = [];

    const absRoot = this.root.absolute;

    for (let i = 0; i < files.length; i++) {
      let filePath = files[i];

      const absFile = filePath.absolute;

      let cleanFilePath = absFile.replace(absRoot, '');
      cleanFilePath = cleanFilePath.replace(/^[\/\\]/, '');

      filePath = files[i] = cleanFilePath;

      const dataPromise = this.get(filePath, parser);

      dataPromises.push(dataPromise);
    }

    const dataResults = await Promise.all(dataPromises);

    const matches = [];

    for (let i = 0; i < dataResults.length; i++) {
      const filePath = files[i];
      const data = dataResults[i];

      const isMatch = await searcher({
        path: filePath,
        data,
      });

      if (!isMatch) continue;

      matches.push({
        path: filePath,
        data,
      });
    }

    return matches;
  }
}

module.exports = Resources;
