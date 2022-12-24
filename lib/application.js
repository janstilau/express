/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 * @private
 */

var finalhandler = require('finalhandler');
var Router = require('./router');
var methods = require('methods');
var middleware = require('./middleware/init');
var query = require('./middleware/query');
var View = require('./view');
var http = require('http');
var deprecate = require('depd')('express');
var flatten = require('./3rd/array-flatten')
var merge = require('utils-merge');
var resolve = require('path').resolve;
var setPrototypeOf = require('setprototypeof')

var compileETag = require('./utils').compileETag;
var compileQueryParser = require('./utils').compileQueryParser;
var compileTrust = require('./utils').compileTrust;

/**
 * Module variables.
 * @private
 */

var hasOwnProperty = Object.prototype.hasOwnProperty
var slice = Array.prototype.slice;

/**
 * Application prototype.
 */

// 输出的对象, 就是一个盒子, 不同的是, 这个盒子里面都是方法. 
// 在 express.js 文件里面, 将里面的方法继承了. 所以这可以看多是一个原型对象. 
var AppActions = exports = module.exports = {};

/**
 * Variable for trust proxy inheritance back-compat
 * @private
 */

var trustProxyDefaultSymbol = '@@symbol:trust_proxy_default';

/**
 * Initialize the server.
 *
 *   - setup default configuration
 *   - setup default middleware
 *   - setup route reflection methods
 *
 * @private
 */

// 使用了非常特殊的 Init 方法, 完成了对象的初始化. 
// 当 Init 被调用的时候, 已经完成了 mixin 的调用, 所以一定是会有 defaultConfiguration 方法的. 
AppActions.init = function init() {
  this.cache = {};
  this.engines = {};
  this.settings = {};

  this.defaultConfiguration();
};

// 如果是两个参数, 就是赋值. 
// 如果是一个参数, 就是取值.
// JS 方法的灵活性, 是建立在方法内部复杂的判断基础之上的. 
// 这样的使用, 不是好的方式, 不如叫做 set value, 和 get value. 
AppActions.set = function set(setting, val) {
  if (arguments.length === 1) {
    // get 的实现. 
    var settings = this.settings

    // 为什么要这面复杂呢, 这个 Setting 不就是一个对象am. 
    while (settings && settings !== Object.prototype) {
      if (hasOwnProperty.call(settings, setting)) {
        return settings[setting]
      }
      settings = Object.getPrototypeOf(settings)
    }

    return undefined
  }

  // set value
  this.settings[setting] = val;

  // trigger matched settings
  // 当特殊的 key 值设置之后, 有着对应的属性也要设置. 比如, 设置了缓存相关的策略, 那么具体应该如何操作, 要设置对应的 block. 
  // 这个 block 就不改由外界知道了, 这是程序内部的逻辑. 
  switch (setting) {
    case 'etag':
      this.set('etag fn', compileETag(val));
      break;
    case 'query parser':
      this.set('query parser fn', compileQueryParser(val));
      break;
    case 'trust proxy':
      this.set('trust proxy fn', compileTrust(val));

      // trust proxy inherit back-compat
      Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
        configurable: true,
        value: false
      });

      break;
  }

  // 返回 this, 这样可以链式调用. 
  return this;
};

/**
 * Initialize application configuration.
 * @private
 */

AppActions.defaultConfiguration = function defaultConfiguration() {
  var env = process.env.NODE_ENV || 'development'; // 默认是测试环境. 

  // default settings
  this.enable('x-powered-by');
  this.set('etag', 'weak');
  this.set('env', env);
  this.set('query parser', 'extended');
  this.set('subdomain offset', 2);
  this.set('trust proxy', false);

  // trust proxy inherit back-compat
  Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
    configurable: true,
    value: true
  });

  this.on('mount', function onmount(parent) {
    // inherit trust proxy
    if (this.settings[trustProxyDefaultSymbol] === true
      && typeof parent.settings['trust proxy fn'] === 'function') {
      delete this.settings['trust proxy'];
      delete this.settings['trust proxy fn'];
    }

    // inherit protos
    setPrototypeOf(this.request, parent.request)
    setPrototypeOf(this.response, parent.response)
    setPrototypeOf(this.engines, parent.engines)
    setPrototypeOf(this.settings, parent.settings)
  });

  // setup locals
  this.locals = Object.create(null);

  // top-most app is mounted at /
  this.mountpath = '/';

  // default locals
  this.locals.settings = this.settings;

  // default configuration
  this.set('view', View);
  this.set('views', resolve('views'));
  this.set('jsonp callback name', 'callback');

  if (env === 'production') {
    this.enable('view cache');
  }

  Object.defineProperty(this, 'router', {
    get: function () {
      throw new Error('\'app.router\' is deprecated!\nPlease see the 3.x to 4.x migration guide for details on how to update your app.');
    }
  });
};

/**
 * lazily adds the base router if it has not yet been added.
 *
 * We cannot add the base router in the defaultConfiguration because
 * it reads app settings which might be set after that has run.
 *
 * @private
 */
// 这个方法, 如果按照我自己来说, 应该叫做 createBaseRouterIfNeed.
AppActions.lazyrouter = function lazyrouter() {
  if (!this._router) {
    this._router = new Router({
      caseSensitive: this.enabled('case sensitive routing'),
      strict: this.enabled('strict routing')
    });

    // 添加一个根中间件, 然后增加了两个默认的中间件. 
    this._router.use(query(this.get('query parser fn')));
    this._router.use(middleware.init(this));
  }
};

/**
 * Dispatch a req, res pair into the application. Starts pipeline processing.
 *
 * If no callback is provided, then default error handlers will respond
 * in the event of an error bubbling through the stack.
 *
 * @private
 */

// Http 模块到 express 的入口函数. 
AppActions.handle = function handle(req, res, callback) {
  var router = this._router;

  // final handler
  var done = callback || finalhandler(req, res, {
    env: this.get('env'),
    onerror: logerror.bind(this)
  });

  // no routes
  if (!router) {
    done();
    return;
  }

  // 最终, 是通过 router 来完成 req, res 的队列处理.
  router.handle(req, res, done);
};

/**
 * Proxy `Router#use()` to add middleware to the app router.
 * See Router#use() documentation for details.
 *
 * If the _fn_ parameter is an express app, then it will be
 * mounted at the _route_ specified.
 *
 * @public
 */
// 还会有 多个 app 挂钩的情况????
AppActions.use = function use(fn) {
  var offset = 0;
  var path = '/';

  // default path to '/'
  // disambiguate app.use([fn])
  if (typeof fn !== 'function') {
    var arg = fn;

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1;
      path = fn;
    }
  }

  // 找出 path 出来, 然后后面的都认为是这个 Path 的中间件函数. 
  var fns = flatten(slice.call(arguments, offset));

  if (fns.length === 0) {
    throw new TypeError('app.use() requires a middleware function')
  }

  // setup router
  this.lazyrouter();
  var router = this._router;

  fns.forEach(function (fn) {
    // non-express app
    // !fn.handle || !fn.set 就代表着, 这是一个 fun, 可以直接使用. 
    if (!fn || !fn.handle || !fn.set) {
      return router.use(path, fn);
    }

    fn.mountpath = path;
    fn.parent = this;

    // restore .app property on req and res
    router.use(path,
      function mounted_app(req, res, next) {
        var orig = req.app;
        fn.handle(req, res, function (err) {
          setPrototypeOf(req, orig.request)
          setPrototypeOf(res, orig.response)
          next(err);
        });
      });

    // mounted an app
    // 从这里看, 会有多个 app 挂钩的情况. 
    fn.emit('mount', this);
  }, this);

  return this;
};

/**
 * Proxy to the app `Router#route()`
 * Returns a new `Route` instance for the _path_.
 *
 * Routes are isolated middleware stacks for specific paths.
 * See the Route api docs for details.
 *
 * @public
 */

AppActions.route = function route(path) {
  this.lazyrouter();
  return this._router.route(path);
};

/**
 * Register the given template engine callback `fn`
 * as `ext`.
 *
 * By default will `require()` the engine based on the
 * file extension. For example if you try to render
 * a "foo.ejs" file Express will invoke the following internally:
 *
 *     app.engine('ejs', require('ejs').__express);
 *
 * For engines that do not provide `.__express` out of the box,
 * or if you wish to "map" a different extension to the template engine
 * you may use this method. For example mapping the EJS template engine to
 * ".html" files:
 *
 *     app.engine('html', require('ejs').renderFile);
 *
 * In this case EJS provides a `.renderFile()` method with
 * the same signature that Express expects: `(path, options, callback)`,
 * though note that it aliases this method as `ejs.__express` internally
 * so if you're using ".ejs" extensions you don't need to do anything.
 *
 * Some template engines do not follow this convention, the
 * [Consolidate.js](https://github.com/tj/consolidate.js)
 * library was created to map all of node's popular template
 * engines to follow this convention, thus allowing them to
 * work seamlessly within Express.
 *
 * @param {String} ext
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

AppActions.engine = function engine(ext, fn) {
  if (typeof fn !== 'function') {
    throw new Error('callback function required');
  }

  // get file extension
  var extension = ext[0] !== '.'
    ? '.' + ext
    : ext;

  // store engine
  this.engines[extension] = fn;

  return this;
};

/**
 * Proxy to `Router#param()` with one added api feature. The _name_ parameter
 * can be an array of names.
 *
 * See the Router#param() docs for more details.
 *
 * @param {String|Array} name
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

AppActions.param = function param(name, fn) {
  this.lazyrouter();

  if (Array.isArray(name)) {
    for (var i = 0; i < name.length; i++) {
      this.param(name[i], fn);
    }

    return this;
  }

  this._router.param(name, fn);

  return this;
};

// enable 还是调用 set, 将对应的 key 值设置为 true.
AppActions.enable = function enable(setting) {
  return this.set(setting, true);
};

// disable 还是调用 set, 将对应的 key 值设置为 false.
AppActions.disable = function disable(setting) {
  return this.set(setting, false);
};

// enabled 是一个 Get 函数, 从 setting 里面读取对应的 key 值.
AppActions.enabled = function enabled(setting) {
  return Boolean(this.set(setting));
};

// disabled 是一个 Get 函数, 从 setting 里面读取对应的 key 值.
AppActions.disabled = function disabled(setting) {
  return !this.set(setting);
};



/**
 * Return the app's absolute pathname
 * based on the parent(s) that have
 * mounted it.
 *
 * For example if the application was
 * mounted as "/admin", which itself
 * was mounted as "/blog" then the
 * return value would be "/blog/admin".
 *
 * @return {String}
 * @private
 */

AppActions.path = function path() {
  return this.parent ? this.parent.path() + this.mountpath : '';
};

/**
 * Delegate `.VERB(...)` calls to `router.VERB(...)`.
 */

methods.forEach(function (method) {
  AppActions[method] = function (path) {
    if (method === 'get' && arguments.length === 1) {
      // app.get(setting)
      // 如果是单参数, 就是在调用 get 函数. 但是没有 get 函数, 是 set 函数当做 set, get 了
      // 这样玩弄技巧是在让人难以理解. 
      return this.set(path);
    }

    this.lazyrouter();

    // 新建了一个 route 来处理, 在 rootRouter 上增加了一个中间件. 
    var route = this._router.route(path);
    route[method].apply(route, slice.call(arguments, 1));
    return this;
  };
});

/**
 * Special-cased "all" method, applying the given route `path`,
 * middleware, and callback to _every_ HTTP method.
 *
 * @param {String} path
 * @param {Function} ...
 * @return {app} for chaining
 * @public
 */

AppActions.all = function all(path) {
  this.lazyrouter();

  var route = this._router.route(path);
  var args = slice.call(arguments, 1);

  // 这里直接调用 route.all 怎么了. 
  for (var i = 0; i < methods.length; i++) {
    route[methods[i]].apply(route, args);
  }

  return this;
};

// del -> delete alias

AppActions.del = deprecate.function(AppActions.delete, 'app.del: Use app.delete instead');

/**
 * Render the given view `name` name with `options`
 * and a callback accepting an error and the
 * rendered template string.
 *
 * Example:
 *
 *    app.render('email', { name: 'Tobi' }, function(err, html){
 *      // ...
 *    })
 *
 * @param {String} name
 * @param {Object|Function} options or fn
 * @param {Function} callback
 * @public
 */

AppActions.render = function render(name, options, callback) {
  var cache = this.cache;
  var done = callback;
  var engines = this.engines;
  var opts = options;
  var renderOptions = {};
  var view;

  // support callback function as second arg
  if (typeof options === 'function') {
    done = options;
    opts = {};
  }

  // merge app.locals
  merge(renderOptions, this.locals);

  // merge options._locals
  if (opts._locals) {
    merge(renderOptions, opts._locals);
  }

  // merge options
  merge(renderOptions, opts);

  // set .cache unless explicitly provided
  if (renderOptions.cache == null) {
    renderOptions.cache = this.enabled('view cache');
  }

  // primed cache
  if (renderOptions.cache) {
    view = cache[name];
  }

  // view
  if (!view) {
    var View = this.get('view');

    view = new View(name, {
      defaultEngine: this.get('view engine'),
      root: this.get('views'),
      engines: engines
    });

    if (!view.path) {
      var dirs = Array.isArray(view.root) && view.root.length > 1
        ? 'directories "' + view.root.slice(0, -1).join('", "') + '" or "' + view.root[view.root.length - 1] + '"'
        : 'directory "' + view.root + '"'
      var err = new Error('Failed to lookup view "' + name + '" in views ' + dirs);
      err.view = view;
      return done(err);
    }

    // prime the cache
    if (renderOptions.cache) {
      cache[name] = view;
    }
  }

  // render
  tryRender(view, renderOptions, done);
};

/**
 * Listen for connections.
 *
 * A node `http.Server` is returned, with this
 * application (which is a `Function`) as its
 * callback. If you wish to create both an HTTP
 * and HTTPS server you may do so with the "http"
 * and "https" modules as shown here:
 *
 *    var http = require('http')
 *      , https = require('https')
 *      , express = require('express')
 *      , app = express();
 *
 *    http.createServer(app).listen(80);
 *    https.createServer({ ... }, app).listen(443);


const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    data: 'Hello World!',
  }));
});

 * @return {http.Server}
 * @public
 */


AppActions.listen = function listen() {
  // this 是一个函数对象. 
  var server = http.createServer(this);
  return server.listen.apply(server, arguments);
};

/**
 * Log error using console.error.
 *
 * @param {Error} err
 * @private
 */

function logerror(err) {
  /* istanbul ignore next */
  if (this.get('env') !== 'test') console.error(err.stack || err.toString());
}

/**
 * Try rendering a view.
 * @private
 */

function tryRender(view, options, callback) {
  try {
    view.render(options, callback);
  } catch (err) {
    callback(err);
  }
}
