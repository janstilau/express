'use strict';

/**
 * Module dependencies.
 * @api private
 */

var Buffer = require('safe-buffer').Buffer
var contentDisposition = require('content-disposition');
var contentType = require('content-type');
var deprecate = require('depd')('express');
var flatten = require('array-flatten');
var mime = require('send').mime;
// 如何生成 Etag 的策略, 是从第三方库里面获取的. 
var etag = require('etag');

var proxyaddr = require('proxy-addr');
var qs = require('qs');
var querystring = require('querystring');

/*
强校验的ETag匹配要求两个资源内容的每个字节需完全相同，包括所有其他实体字段（如Content-Language）不发生变化。强ETag允许重新装配和缓存部分响应，以及字节范围请求。弱校验的ETag匹配要求两个资源在语义上相等，这意味着在实际情况下它们可以互换，而且缓存副本也可以使用。不过这些资源不需要每个字节相同，因此弱ETag不适合字节范围请求。当Web服务器无法生成强ETag的时候，比如动态生成的内容，弱ETag就可能发挥作用了。
*/

/**
 * Return strong ETag for `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */
exports.etag = createETagGenerator({ weak: false })

/**
 * Return weak ETag for `body`.
 *
 * @param {String|Buffer} body
 * @param {String} [encoding]
 * @return {String}
 * @api private
 */
exports.wetag = createETagGenerator({ weak: true })

/**
 * Check if `path` looks absolute.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

exports.isAbsolute = function (path) {
  if ('/' === path[0]) return true;
  if (':' === path[1] && ('\\' === path[2] || '/' === path[2])) return true; // Windows device path
  if ('\\\\' === path.substring(0, 2)) return true; // Microsoft Azure absolute path
};

/**
 * Flatten the given `arr`.
 *
 * @param {Array} arr
 * @return {Array}
 * @api private
 */

exports.flatten = deprecate.function(flatten,
  'utils.flatten: use array-flatten npm module instead');

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */

exports.normalizeType = function (type) {
  return ~type.indexOf('/')
    ? acceptParams(type)
    : { value: mime.lookup(type), params: {} };
};

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */

exports.normalizeTypes = function (types) {
  var ret = [];

  for (var i = 0; i < types.length; ++i) {
    ret.push(exports.normalizeType(types[i]));
  }

  return ret;
};

/**
 * Generate Content-Disposition header appropriate for the filename.
 * non-ascii filenames are urlencoded and a filename* parameter is added
 *
 * @param {String} filename
 * @return {String}
 * @api private
 */

exports.contentDisposition = deprecate.function(contentDisposition,
  'utils.contentDisposition: use content-disposition npm module instead');

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 * also includes `.originalIndex` for stable sorting
 *
 * @param {String} str
 * @param {Number} index
 * @return {Object}
 * @api private
 */

function acceptParams(str, index) {
  var parts = str.split(/ *; */);
  var ret = { value: parts[0], quality: 1, params: {}, originalIndex: index };

  for (var i = 1; i < parts.length; ++i) {
    var pms = parts[i].split(/ *= */);
    if ('q' === pms[0]) {
      ret.quality = parseFloat(pms[1]);
    } else {
      ret.params[pms[0]] = pms[1];
    }
  }

  return ret;
}

/**
 * Compile "etag" value to function.
 *
 * @param  {Boolean|String|Function} val
 * @return {Function}
 * @api private
 */

/*
ETag是HTTP协议提供的若干机制中的一种Web缓存验证机制，并且允许客户端进行缓存协商。这就使得缓存变得更加高效，而且节省带宽。如果资源的内容没有发生改变，Web服务器就不需要发送一个完整的响应。
ETag是一个不透明的标识符，由Web服务器根据URL上的资源的特定版本而指定。如果那个URL上的资源内容改变，一个新的不一样的ETag就会被分配。用这种方法使用ETag即类似于指纹，并且他们能够被快速地被比较，以确定两个版本的资源是否相同。ETag的比较只对同一个URL有意义——不同URL上的资源的ETag值可能相同也可能不同，从他们的ETag的比较中无从推断。

在典型用法中，当一个URL被请求，Web服务器会返回资源和其相应的ETag值，它会被放置在HTTP的“ETag”字段中：

ETag: "686897696a7c876b7e"
然后，客户端可以决定是否缓存这个资源和它的ETag。以后，如果客户端想再次请求相同的URL，将会发送一个包含已保存的ETag和“If-None-Match”字段的请求。

If-None-Match: "686897696a7c876b7e"
客户端请求之后，服务器可能会比较客户端的ETag和当前版本资源的ETag。如果ETag值匹配，这就意味着资源没有改变，服务器便会发送回一个极短的响应，包含HTTP “304 未修改”的状态。304状态告诉客户端，它的缓存版本是最新的，并应该使用它。

然而，如果ETag的值不匹配，这就意味着资源很可能发生了变化，那么，一个完整的响应就会被返回，包括资源的内容，就好像ETag没有被使用。这种情况下，客户端可以用新返回的资源和新的ETag替代先前的缓存版本。

实际上, 这是浏览器, 或者 NSSession 框架的责任. 因为是他们进行缓存的存储. 
就算是服务器给的是 304, 他们应该将 response 修改为 200, 带上自己缓存的 data 作为 body. 因为对于客户端来说, 他并不知道缓存这回事.
*/
exports.compileETag = function (val) {
  var fn;

  if (typeof val === 'function') {
    // 如果, Etag 对应的值就是一个方法, 那么直接使用该方法作为 Etag 的生成策略. 
    return val;
  }

  switch (val) {
    case true:
      // 真正的如何进行 tag 的生成, 还是交给了第三方类库.
    case 'weak':
      // 
      fn = exports.wetag;
      break;
    case 'strong':
      fn = exports.etag;
      break;
    case false:
      // 删除 Etag 的值. 
      // fn 是 undefined.
      break;
    default:
      throw new TypeError('unknown value for etag function: ' + val);
  }

  return fn;
}

/**
 * Compile "query parser" value to function.
 *
 * @param  {String|Function} val
 * @return {Function}
 * @api private
 */

exports.compileQueryParser = function compileQueryParser(val) {
  var fn;

  if (typeof val === 'function') {
    return val;
  }

  switch (val) {
    case true:
    case 'simple':
      fn = querystring.parse;
      break;
    case false:
      fn = newObject;
      break;
    case 'extended':
      fn = parseExtendedQueryString;
      break;
    default:
      throw new TypeError('unknown value for query parser function: ' + val);
  }

  return fn;
}

/**
 * Compile "proxy trust" value to function.
 *
 * @param  {Boolean|String|Number|Array|Function} val
 * @return {Function}
 * @api private
 */

exports.compileTrust = function (val) {
  if (typeof val === 'function') return val;

  if (val === true) {
    // Support plain true/false
    return function () { return true };
  }

  if (typeof val === 'number') {
    // Support trusting hop count
    return function (a, i) { return i < val };
  }

  if (typeof val === 'string') {
    // Support comma-separated values
    val = val.split(',')
      .map(function (v) { return v.trim() })
  }

  return proxyaddr.compile(val || []);
}

/**
 * Set the charset in a given Content-Type string.
 *
 * @param {String} type
 * @param {String} charset
 * @return {String}
 * @api private
 */

exports.setCharset = function setCharset(type, charset) {
  if (!type || !charset) {
    return type;
  }

  // parse type
  var parsed = contentType.parse(type);

  // set charset
  parsed.parameters.charset = charset;

  // format type
  return contentType.format(parsed);
};

/**
 * Create an ETag generator function, generating ETags with
 * the given options.
 *
 * @param {object} options
 * @return {function}
 * @private
 */

function createETagGenerator(options) {
  return function generateETag(body, encoding) {
    var buf = !Buffer.isBuffer(body)
      ? Buffer.from(body, encoding)
      : body

    return etag(buf, options)
  }
}

/**
 * Parse an extended query string with qs.
 *
 * @return {Object}
 * @private
 */

function parseExtendedQueryString(str) {
  return qs.parse(str, {
    allowPrototypes: true
  });
}

/**
 * Return new empty object.
 *
 * @return {Object}
 * @api private
 */

function newObject() {
  return {};
}
