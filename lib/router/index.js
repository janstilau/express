'use strict';

var Route = require('./route');
var Layer = require('./layer');
var methods = require('methods');
/*
exports = module.exports = function(a, b){
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
};
*/
var mixin = require('utils-merge'); // 输出工具方法.
var deprecate = require('depd')('express');
var flatten = require('../3rd/array-flatten');
var parseUrl = require('parseurl');
var setPrototypeOf = require('setprototypeof')

var objectRegExp = /^\[object (\S+)\]$/;
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;

// express.Router 就是这个函数.
// let router = express.Router() 的到一个路由对象, 然后在上面进行 get, post 注册. 
// 这个对象是个函数, 它可以作为一个回调. 然后回调里面逻辑是, 由这个对象来进行 handle. 
// 说实话, 这个技巧很垃圾, 不然返回一个新的函数, 然后这个新的函数捕获 router, 由 router 进行 handle.
var proto = module.exports = function (options) {
  var opts = options || {};

  // App .use 的时候, 传递进去的 router 也是一个 func, 只不过他的 func 是调用自己来处理. 
  function router(req, res, next) {
    router.handle(req, res, next);
  }

  // mixin Router class functions
  // setPrototypeOf 就是 Object.setPrototypeOf, 库里面有一些特殊处理, 应该是为了适配.
  // 在 express 里面, 是用了 mixin 的方式, 这里又用的 prototype. 不是很统一啊. 
  // 不过, 能够明确的是, 这里返回了一个对象, 下面是对象的赋值, 各种对象的操作, 放到了 proto 里面, 在这个文件里面进行定义.
  setPrototypeOf(router, proto)

  router.params = {};
  router._params = [];
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.strict = opts.strict;
  router.stack = [];

  return router;
};

/**
 * Map the given param placeholder `name`(s) to the given callback.
 *
 * Parameter mapping is used to provide pre-conditions to routes
 * which use normalized placeholders. For example a _:user_id_ parameter
 * could automatically load a user's information from the database without
 * any additional code,
 *
 * The callback uses the same signature as middleware, the only difference
 * being that the value of the placeholder is passed, in this case the _id_
 * of the user. Once the `next()` function is invoked, just like middleware
 * it will continue on to execute the route, or subsequent parameter functions.
 *
 * Just like in middleware, you must either respond to the request or call next
 * to avoid stalling the request.
 *
 *  app.param('user_id', function(req, res, next, id){
 *    User.find(id, function(err, user){
 *      if (err) {
 *        return next(err);
 *      } else if (!user) {
 *        return next(new Error('failed to load user'));
 *      }
 *      req.user = user;
 *      next();
 *    });
 *  });
 *
 * @param {String} name
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

proto.param = function param(name, fn) {
  // param logic
  if (typeof name === 'function') {
    deprecate('router.param(fn): Refactor to use path params');
    this._params.push(name);
    return;
  }

  // apply param functions
  var params = this._params;
  var len = params.length;
  var ret;

  if (name[0] === ':') {
    deprecate('router.param(' + JSON.stringify(name) + ', fn): Use router.param(' + JSON.stringify(name.slice(1)) + ', fn) instead')
    name = name.slice(1)
  }

  for (var i = 0; i < len; ++i) {
    if (ret = params[i](name, fn)) {
      fn = ret;
    }
  }

  // ensure we end up with a
  // middleware function
  if ('function' !== typeof fn) {
    throw new Error('invalid param() call for ' + name + ', got ' + fn);
  }

  (this.params[name] = this.params[name] || []).push(fn);
  return this;
};

/**
 * Dispatch a req, res into the router.
 * @private
 */

/*
可以使用 OPTIONS 方法对服务器发起请求，以检测服务器支持哪些 HTTP 方法：
-i 表示, 打印出响应头的信息. 
-X参数指定 HTTP 请求的方法。
curl -X OPTIONS http://example.org -i

HTTP/1.1 200 OK
Allow: OPTIONS, GET, HEAD, POST
Cache-Control: max-age=604800
Content-Type: text/html; charset=UTF-8
Date: Sat, 24 Dec 2022 06:30:00 GMT
Expires: Sat, 31 Dec 2022 06:30:00 GMT
Server: EOS (vny/0452)
Content-Length: 0

在 CORS 中，可以使用 OPTIONS 方法发起一个预检请求，以检测实际请求是否可以被服务器所接受。预检请求报文中的 Access-Control-Request-Method 首部字段告知服务器实际请求所使用的 HTTP 方法；Access-Control-Request-Headers 首部字段告知服务器实际请求所携带的自定义首部字段。服务器基于从预检请求获得的信息来判断，是否接受接下来的实际请求。

OPTIONS /resources/post-here/ HTTP/1.1
Host: bar.other
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*
Accept-Language: en-us,en;q=0.5
Accept-Encoding: gzip,deflate
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7
Connection: keep-alive
Origin: http://foo.example
Access-Control-Request-Method: POST // 发送请求的方法. 
Access-Control-Request-Headers: X-PINGOTHER, Content-Type
Copy to ClipboardCopy to Clipboard
服务器所返回的 Access-Control-Allow-Methods 首部字段将所有允许的请求方法告知客户端。该首部字段与 Allow 类似，但只能用于涉及到 CORS 的场景中。

HTTP/1.1 200 OK
Date: Mon, 01 Dec 2008 01:15:39 GMT
Server: Apache/2.0.61 (Unix)
Access-Control-Allow-Origin: http://foo.example
Access-Control-Allow-Methods: POST, GET, OPTIONS // 返回了服务器接受的方法. 
Access-Control-Allow-Headers: X-PINGOTHER, Content-Type
Access-Control-Max-Age: 86400
Vary: Accept-Encoding, Origin
Content-Encoding: gzip
Content-Length: 0
Keep-Alive: timeout=2, max=100
Connection: Keep-Alive
Content-Type: text/plain

*/

// 当请求到来的时候, 是使用该方法进行的处理. 
proto.handle = function handle(req, res, out) {
  var self = this;

  var idx = 0;
  var protohost = getProtohost(req.url) || '' // req.url => /login
  var removed = '';
  var slashAdded = false;
  var sync = 0
  var paramcalled = {};

  // store options for OPTIONS request
  // only used if OPTIONS request
  var options = [];

  // middleware and routes 拿到了所有的中间件了. 
  var layerStack = self.stack;

  // manage inter-router variables
  var parentParams = req.params;
  var parentUrl = req.baseUrl || '';
  var done = restore(out, req, 'baseUrl', 'next', 'params');

  // setup next layer
  req.next = nextHandler;

  // for options requests, respond with a default if nothing else responds
  if (req.method === 'OPTIONS') {
    done = wrap(done, function (old, err) {
      if (err || options.length === 0) return old(err);
      sendOptionsResponse(res, options, old);
    });
  }

  // setup basic req values
  req.baseUrl = parentUrl;
  req.originalUrl = req.originalUrl || req.url;

  nextHandler();

  function nextHandler(err) {
    var layerError = err === 'route'
      ? null
      : err;

    // remove added slash
    if (slashAdded) {
      req.url = req.url.slice(1)
      slashAdded = false;
    }

    // restore altered req.url
    if (removed.length !== 0) {
      req.baseUrl = parentUrl;
      req.url = protohost + removed + req.url.slice(protohost.length)
      removed = '';
    }

    // signal to exit router
    if (layerError === 'router') {
      setImmediate(done, null)
      return
    }

    // no more matching layers
    if (idx >= layerStack.length) {
      setImmediate(done, layerError);
      return;
    }

    // max sync stack
    if (++sync > 100) {
      return setImmediate(nextHandler, err)
    }

    // get pathname of request
    var path = getPathname(req);

    if (path == null) {
      return done(layerError);
    }

    // find next matching layer
    var currentLayer;
    var match;
    var route;

    while (match !== true && idx < layerStack.length) {
      currentLayer = layerStack[idx++];
      match = matchLayer(currentLayer, path);

      route = currentLayer.route; // 直接挂在方法, 就是没有 route 的值啊. 

      if (typeof match !== 'boolean') {
        // hold on to layerError
        layerError = layerError || match;
      }

      // 如果, 这个 Layer 不满足, 直接下一个. idx 在第一行就 ++ 了. 
      if (match !== true) {
        continue;
      }

      if (!route) {
        // process non-route handlers normally
        // 当 Match 了之后, 如果没有 route, continue 会在循环的起始位置跳出. 
        // 垃圾写法. 
        continue;
      }

      if (layerError) {
        // routes do not match with a pending error
        match = false;
        continue;
      }

      var method = req.method;
      var has_method = route._handles_method(method);

      // build up automatic options response

      if (!has_method && method === 'OPTIONS') {
        // 
        appendMethods(options, route._options());
      }

      // don't even bother matching route
      if (!has_method && method !== 'HEAD') {
        match = false;
      }
    }

    // 当 Match 为 true 之后, 跳出循环了.
    // no match
    if (match !== true) {
      return done(layerError);
    }

    // store route for dispatch on change
    if (route) {
      req.route = route;
    }

    // Capture one-time layer values
    // 在 Layer 进行 Match 的时候, 根据 path 将 params, path 赋值到了自己身上. 
    // 这些都没有在自己类内使用, 它仅仅是一个盒子, 在这里是给 req 使用了. 
    req.params = self.mergeParams
      ? mergeParams(currentLayer.params, parentParams)
      : currentLayer.params;
    var layerPath = currentLayer.path;

    // this should be done for the layer
    self.process_params(currentLayer, paramcalled, req, res, function (err) {
      if (err) {
        nextHandler(layerError || err)
      } else if (route) {
        // 如果是 Route, 就是 get, post 这种添加的中间件. 
        // nextHandler 带有状态的, idx 的值. 所以在中间件完成之后调用 next, 不会从自己这里开始了. 
        currentLayer.handle_request(req, res, nextHandler)
      } else {
        // 没有 route, 就是回调函数, 交给回调函数处理. 
        trim_prefix(currentLayer, layerError, layerPath, path)
      }

      sync = 0
    });
  }

  function trim_prefix(layer, layerError, layerPath, path) {
    if (layerPath.length !== 0) {
      // Validate path is a prefix match
      if (layerPath !== path.slice(0, layerPath.length)) {
        nextHandler(layerError)
        return
      }

      // Validate path breaks on a path separator
      var c = path[layerPath.length]
      if (c && c !== '/' && c !== '.') return nextHandler(layerError)

      // Trim off the part of the url that matches the route
      // middleware (.use stuff) needs to have the path stripped
      removed = layerPath;
      req.url = protohost + req.url.slice(protohost.length + removed.length)

      // Ensure leading slash
      if (!protohost && req.url[0] !== '/') {
        req.url = '/' + req.url;
        slashAdded = true;
      }

      // Setup base URL (no trailing slash)
      req.baseUrl = parentUrl + (removed[removed.length - 1] === '/'
        ? removed.substring(0, removed.length - 1)
        : removed);
    }

    if (layerError) {
      layer.handle_error(layerError, req, res, nextHandler);
    } else {
      layer.handle_request(req, res, nextHandler);
    }
  }
};

/**
 * Process any parameters for the layer.
 * @private
 */

proto.process_params = function process_params(layer, called, req, res, done) {
  var params = this.params;

  // captured parameters from the layer, keys and values
  var keys = layer.keys;

  // fast track
  if (!keys || keys.length === 0) {
    return done();
  }

  var i = 0;
  var name;
  var paramIndex = 0;
  var key;
  var paramVal;
  var paramCallbacks;
  var paramCalled;

  // process params in order
  // param callbacks can be async
  function param(err) {
    if (err) {
      return done(err);
    }

    if (i >= keys.length) {
      return done();
    }

    paramIndex = 0;
    key = keys[i++];
    name = key.name;
    paramVal = req.params[name];
    paramCallbacks = params[name];
    paramCalled = called[name];

    if (paramVal === undefined || !paramCallbacks) {
      return param();
    }

    // param previously called with same value or error occurred
    if (paramCalled && (paramCalled.match === paramVal
      || (paramCalled.error && paramCalled.error !== 'route'))) {
      // restore value
      req.params[name] = paramCalled.value;

      // next param
      return param(paramCalled.error);
    }

    called[name] = paramCalled = {
      error: null,
      match: paramVal,
      value: paramVal
    };

    paramCallback();
  }

  // single param callbacks
  function paramCallback(err) {
    var fn = paramCallbacks[paramIndex++];

    // store updated value
    paramCalled.value = req.params[key.name];

    if (err) {
      // store error
      paramCalled.error = err;
      param(err);
      return;
    }

    if (!fn) return param();

    try {
      fn(req, res, paramCallback, paramVal, key.name);
    } catch (e) {
      paramCallback(e);
    }
  }

  param();
};

/**
 * Use the given middleware function, with optional path, defaulting to "/".
 *
 * Use (like `.all`) will run for any http METHOD, but it will not add
 * handlers for those methods so OPTIONS requests will not consider `.use`
 * functions even if they could respond.
 *
 * The other difference is that _route_ path is stripped and not visible
 * to the handler function. The main effect of this feature is that mounted
 * handlers can operate without any code changes regardless of the "prefix"
 * pathname.
 *
 * @public
 */

proto.use = function use(middleWareFun) {
  var offset = 0;
  var middlewarePath = '/';

  // default path to '/'
  // disambiguate router.use([fn])
  // 消除（模棱两可的句子、词组或其他语言单位的）歧义
  if (typeof middleWareFun !== 'function') {
    var arg = middleWareFun;

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1;
      middlewarePath = middleWareFun;
    }
  }

  var callbacks = flatten(slice.call(arguments, offset));

  if (callbacks.length === 0) {
    throw new TypeError('Router.use() requires a middleware function')
  }

  // 给所有的 callback 注册中间件. 因为有着 Path, 所以所有的都放一个数组也无妨. 
  for (var i = 0; i < callbacks.length; i++) {
    var middleWareFuncItem = callbacks[i];

    if (typeof middleWareFuncItem !== 'function') {
      throw new TypeError('Router.use() requires a middleware function but got a ' + gettype(middleWareFun))
    }

    // add the middleware

    var layer = new Layer(middlewarePath, {
      sensitive: this.caseSensitive,
      strict: false,
      end: false
    }, middleWareFuncItem);

    layer.route = undefined;
    this.stack.push(layer);
  }

  return this;
};

/**
 * Create a new Route for the given path.
 *
 * Each route contains a separate middleware stack and VERB handlers.
 *
 * See the Route api documentation for details on adding handlers
 * and middleware to routes.
 */

// 如果熟悉这套规则, 可以使用 route 来获取到对应的 Rout 对象, 然后在上面调用 get, post, all 等方法
// 在构建 Route 的过程中, 就把这个对象添加到了 stack 的内部, 所以还是会参与到运算. 
// 如果直接使用 router.get, post, 也是会添加一个 route layer, 不过里面只会有一个 get, post 方法的使用而已. 
proto.route = function route(path) {
  var route = new Route(path);

  var layer = new Layer(path, {
    sensitive: this.caseSensitive,
    strict: this.strict,
    end: true
  },
    // 以 Route 为主体的 Layer, 处理函数就是交给 Route 进行 dispatch. 
    route.dispatch.bind(route));

  layer.route = route;

  this.stack.push(layer);
  return route;
};

/*  在这里, 将所有的 get, post 请求方法进行了注册. 
虽然不能像 ruby 那样, 直接在类型里面进行类对象的修改. 
但是能够随意的构建一个对象, 添加各种方法之后作为另外一个对象的原型, 也让 js 在类型修改中及其便利. 
*/
/*
let router = express.Router()
router.get('user/get', function (req, resp, next) {

})
上面之所以能够调用, 是在这里进行了原型对象属性的赋值.
*/
methods.concat('all').forEach(function (method) {
  proto[method] = function (path) {
    // 每一次 router 的调用, 都会给自己的 stack 增加一个 Layer
    var route = this.route(path)
    // The apply() method calls the specified function with a given this value, and arguments provided as an array (or an array-like object).
    route[method].apply(route, slice.call(arguments, 1));
    return this; // 返回 this, 可以继续进行链式操作. 
  };
});

// append methods to a list of methods
function appendMethods(list, addition) {
  for (var i = 0; i < addition.length; i++) {
    var method = addition[i];
    if (list.indexOf(method) === -1) {
      list.push(method);
    }
  }
}

// get pathname of request
function getPathname(req) {
  try {
    return parseUrl(req).pathname;
  } catch (err) {
    return undefined;
  }
}

// Get get protocol + host for a URL
function getProtohost(url) {
  if (typeof url !== 'string' || url.length === 0 || url[0] === '/') {
    return undefined
  }

  var searchIndex = url.indexOf('?')
  // 根据是否有 ? 来判断 Path 的范围. 
  // 之所以可以这样判断, 是 URL 有着要求的, 就是?之后就是算作 query 了. 必须符合这种设定.
  var pathLength = searchIndex !== -1
    ? searchIndex
    : url.length
  var fqdnIndex = url.slice(0, pathLength).indexOf('://')

  // url.slice(0, pathLength) 截取到了 path 为止的内容, 然后判断里面是否有 protocol 的信息. 
  return fqdnIndex !== -1
    ? url.substring(0, url.indexOf('/', 3 + fqdnIndex))
    : undefined
}

// get type for error message
function gettype(obj) {
  var type = typeof obj;

  if (type !== 'object') {
    return type;
  }

  // inspect [[Class]] for objects
  return toString.call(obj)
    .replace(objectRegExp, '$1');
}

/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer(layer, path) {
  try {
    return layer.match(path);
  } catch (err) {
    return err;
  }
}

// merge params with parent params
function mergeParams(params, parent) {
  if (typeof parent !== 'object' || !parent) {
    return params;
  }

  // make copy of parent for base
  var obj = mixin({}, parent);

  // simple non-numeric merging
  if (!(0 in params) || !(0 in parent)) {
    return mixin(obj, params);
  }

  var i = 0;
  var o = 0;

  // determine numeric gaps
  while (i in params) {
    i++;
  }

  while (o in parent) {
    o++;
  }

  // offset numeric indices in params before merge
  for (i--; i >= 0; i--) {
    params[i + o] = params[i];

    // create holes for the merge when necessary
    if (i < o) {
      delete params[i];
    }
  }

  return mixin(obj, params);
}

// restore obj props after function
function restore(fn, obj) {
  var propkeys = new Array(arguments.length - 2);
  var vals = new Array(arguments.length - 2);

  // 在处理之前, 在这里记录了当前 req 的值. 
  for (var i = 0; i < propkeys.length; i++) {
    propkeys[i] = arguments[i + 2];
    vals[i] = obj[propkeys[i]];
  }

  // 在交给下一个 Layer 处理的时候, 把这些值重置. 
  // 在中间件里面, 挂钩到 req 上面的值不做处理. 
  return function () {
    // restore vals
    for (var i = 0; i < propkeys.length; i++) {
      obj[propkeys[i]] = vals[i];
    }

    return fn.apply(this, arguments);
  };
}

// send an OPTIONS response
function sendOptionsResponse(res, options, next) {
  try {
    // Options 里面, 最终的就是 Allow, 表示服务器端可以支持的 HttpMethod 的值. 
    // express 是对 Http 模块的封装, 所以实际上 http 怎么封装 res 是里面的逻辑, exrpess 只是添加自己的业务逻辑. 
    var body = options.join(',');
    res.set('Allow', body);
    res.send(body);
  } catch (err) {
    next(err);
  }
}

// wrap a function
function wrap(old, fn) {
  return function proxy() {
    var args = new Array(arguments.length + 1);

    args[0] = old;
    for (var i = 0, len = arguments.length; i < len; i++) {
      args[i + 1] = arguments[i];
    }

    fn.apply(this, args);
  };
}
