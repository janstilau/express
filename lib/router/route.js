'use strict';

var flatten = require('../3rd/array-flatten');
var Layer = require('./layer');
var methods = require('methods');

/*
methods 的值为. 
['acl', 'bind', 'checkout', 'connect', 'copy', 'delete', 'get', 'head', 'link', 'lock', 'm-search', 'merge', 'mkactivity', 'mkcalendar', 'mkcol', 'move', 'notify', 'options', 'patch', 'post', 'propfind', 'proppatch', 'purge', 'put', 'rebind', 'report', 'search', 'source', 'subscribe', 'trace', 'unbind', 'unlink', 'unlock', 'unsubscribe']
*/
var slice = Array.prototype.slice;
var toString = Object.prototype.toString;

// 这个文件的输出是一个 class. 
module.exports = Route;

/**
 * Initialize `Route` with the given `path`,
 *
 * @param {String} path
 * @public
 */

// Route 代表的是, 某个特定路径的处理逻辑. 
// 在里面可以针对 get, post 增加处理处理方法的注册, 也可以增加该路径下的全量处理逻辑(all)
function Route(path) {
  this.path = path;
  this.stack = [];

  // route handlers for various http methods
  this.methods = {};
}

/**
 * Determine if the route handles a given method.
 * @private
 */
// 判断一个 Route 是否可以处理某个 method 方法. 
// Route 代表的是一个 Path 的处理单元. Route 可能只会处理 get, post 请求. 
Route.prototype._handles_method = function _handles_method(method) {
  // 当调用了 all 方法之后, 这个标志位会被赋值. 
  if (this.methods._all) {
    return true;
  }

  var name = method.toLowerCase();

  if (name === 'head' && !this.methods['head']) {
    name = 'get';
  }
  // methods 里面, 标记了这个 Route 到底处理那些 Http 方法. 
  return Boolean(this.methods[name]);
};

/**
 * @return {Array} supported HTTP methods
 * @private
 */

// 返回该路径下可以响应的 Http 方法的值
Route.prototype._options = function _options() {
  var methods = Object.keys(this.methods);

  // append automatic head
  if (this.methods.get && !this.methods.head) {
    /*
从这里可以看出, 如果支持 get, 必然是支持 Head 的. 
HTTP HEAD 方法 请求资源的头部信息，并且这些头部与 HTTP GET 方法请求时返回的一致。该请求方法的一个使用场景是在下载一个大文件前先获取其大小再决定是否要下载，以此可以节约带宽资源。

HEAD 方法的响应不应包含响应正文。即使包含了正文也必须忽略掉。虽然描述正文信息的 entity headers, 例如 Content-Length 可能会包含在响应中，但它们并不是用来描述 HEAD 响应本身的，而是用来描述同样情况下的 GET 请求应该返回的响应。

如果 HEAD 请求的结果显示在上一次 GET 请求后缓存的资源已经过期了，即使没有发出GET请求，缓存也会失效
    */
    methods.push('head');
  }

  // 返回的是 UpperCase 的值. 
  for (var i = 0; i < methods.length; i++) {
    // make upper case
    methods[i] = methods[i].toUpperCase();
  }

  return methods;
};




/**
 * dispatch req, res into this route
 */
// Route 的分发机制. Router Layer 里面会将处理程序转移到这里, Route 也会有 stack. 走完自身的 stack 之后, 才会重新返回到 router 上面. 
// 对于 route 来说, 他的 done 就是跳出 route 的处理, 回到 router 的处理流程中. 

Route.prototype.dispatch = function dispatch(req, res, done) {
  /*
  对于这个函数来说, req 是 Http 模块的 req 对象, 
  res 是 Http 模块的 Res. 
  done 则是 router 层级的 next, 对于 route 层级来说, 他的 next 则是抽取自己的 stack.
  当自己的 stack 完毕之后, 则是调用 done 方法, 调用 router 层级的处理. 
  */
  var idx = 0;
  var stack = this.stack;
  var sync = 0

  if (stack.length === 0) {
    // 如果出现这种情况, 只会是 router.route() 拿到了 route 对象, 但是没有给该对象添加 all, get 等处理. 
    return done();
  }

  var method = req.method.toLowerCase();
  // 主动的, 把 head 变化成为了 get. 
  // 因为客户端发送 head, 服务器是可以响应 get 的, 只要客户端不理睬就可以了. 
  // HEAD 方法的响应不应包含响应正文。即使包含了正文也必须忽略掉
  if (method === 'head' && !this.methods['head']) {
    method = 'get';
  }

  req.route = this;

  nextHandler();

  function nextHandler(happendedError) {
    // 不太明白这两个到底什么时候用, 因为没有看到 = 'route', = 'router' 的赋值相关语句. 
    // signal to exit route
    if (happendedError && happendedError === 'route') {
      return done();
    }

    // signal to exit router
    if (happendedError && happendedError === 'router') {
      return done(happendedError)
    }

    // max sync stack
    // 不能连着加中间件. 
    if (++sync > 100) {
      /* 
      This method is used to break up long running operations and run a callback function immediately after the browser has completed other operations such as events and display updates.
      */
      return setImmediate(nextHandler, happendedError)
    }

    var currentLayer = stack[idx++]

    // end of layers
    // 如果 stack 便利完了, 那么就跳出 route 的 stack 处理流程, 到外层 router 的 stack 处理流程
    if (!currentLayer) {
      return done(happendedError)
    }
    // 在 Router 一层, 并不做 method 的判断, 只有到了 Route 一层, 才做 method 的判断. 
    // 在 Router 一层的 Layer 里面, 只是做 Path 的判断. 
    if (currentLayer.method && currentLayer.method !== method) {
      // 如果 method 不相符, 直接下一个. 助理, 这里的 err 是一致传递过去的. 
      nextHandler(happendedError)
    } else if (happendedError) {
      // 实际上, 可以进行 resume 操作的. 比如参数分解出现了错误, 在错误处理的中间件里面, 调用 next 不传递 error 值就可以了. 
      // 后续的中间件还会继续被调用. 
      currentLayer.handle_error(happendedError, req, res, nextHandler);
    } else {
      currentLayer.handle_request(req, res, nextHandler);
    }

    sync = 0
  }


};

/**
 * Add a handler for all HTTP verbs to this route.
 *
 * Behaves just like middleware and can respond or call `next`
 * to continue processing.
 *
 * You can use multiple `.all` call to add multiple handlers.
 *
 *   function check_something(req, res, next){
 *     next();
 *   };
 *
 *   function validate_user(req, res, next){
 *     next();
 *   };
 *
 *   route
 *   .all(validate_user)
 *   .all(check_something)
 *   .get(function(req, res, next){
 *     res.send('hello world');
 *   });
 *
 * @param {function} handler
 * @return {Route} for chaining
 * @api public
 */

Route.prototype.all = function all() {
  // 从这里看, all 这个方法是允许一次性传递多个处理函数进来的. 
  /*
  JS 的处理, 是建立在回调的基础上的. 只有一个线程. 
  所以一个中间件, 比如 body 的解析, 这是一个异步过程, 这个中间件处理完 监听 request.data, end 然后解析出合适的对象出来, 之后才会调用 next 触发下一个中间件. 
  对于异步调用来说, 时间是不连续的, 但是逻辑上是连续的. 
  各种中间件, 必须是一个接一个被执行, js 的单线程机制也不允许中间件的并行. 

  Route 的中间件, 是特定 Path 的处理函数. 可以针对特定的 Path 进行各种中间件的注册. 
  到了这一步, 就不需要 path 的解析了, 直接走回调函数的注册就可以了.
  */
  var handles = flatten(slice.call(arguments));

  for (var i = 0; i < handles.length; i++) {
    var handle = handles[i];

    if (typeof handle !== 'function') {
      var type = toString.call(handle);
      var msg = 'Route.all() requires a callback function but got a ' + type
      // 这里的 throw 不会被中间件处理的, 这是在注册中间件的过程, 如果出错了, 应该让程序崩溃, 开发人员来进行修改. 
      throw new TypeError(msg);
    }

    // Route 内部的 Layer, 路径没有意义. 
    // 因为 Route 本身带有路径信息, 在 Router 那一层的 Layer 根据路径判断应该说过 route 处理请求, 进入到 route 内部了就是逐个 使用 stack 进行处理了. 
    var layer = Layer('/', {}, handle);
    layer.method = undefined;

    this.methods._all = true; // 给一个对象添加属性. 
    this.stack.push(layer);
  }

  return this; // 返回 this 用来进行链式调用.
};

// 通过这种方式, 加工了类型的属性. 
// JS 的原型机制, 使得一个对象可以轻易成为另外类对象. 使得 JS 里面, 修改类型信息也是非常方便的. 

// 这就是 router.get, post 可以直接使用的原因所在. 
methods.forEach(function (method) {
  Route.prototype[method] = function () {
    // slice.call(arguments) 将类数组对象变化成为了数组. 
    // flatten 将这个数组进行展平. 
    var handles = flatten(slice.call(arguments));

    for (var i = 0; i < handles.length; i++) {
      var handle = handles[i];

      // 如果传递过来的不是 Function, 就抛出一个异常.
      if (typeof handle !== 'function') {
        var type = toString.call(handle);
        var msg = 'Route.' + method + '() requires a callback function but got a ' + type
        throw new Error(msg);
      }

      var layer = Layer('/', {}, handle);
      layer.method = method;

      this.methods[method] = true; // 标志了, 自己这个 route 可以使用 get, post 这个来处理. 
      this.stack.push(layer);
    }

    return this;
  };
});
