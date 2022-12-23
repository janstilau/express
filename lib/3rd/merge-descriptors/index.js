'use strict'

/**
 * Module exports.
 * @public
 */

module.exports = merge

/**
 * Module variables.
 * @private
 */

var hasOwnProperty = Object.prototype.hasOwnProperty

/**
 * Merge the property descriptors of `src` into `dest`
 *
 * @param {object} dest Object to add descriptors to
 * @param {object} src Object to clone descriptors from
 * @param {boolean} [redefine=true] Redefine `dest` properties with `src` properties
 * @returns {object} Reference to dest
 * @public
 */

function merge(dest, src, redefine) {
  if (!dest) {
    throw new TypeError('argument dest is required')
  }

  if (!src) {
    throw new TypeError('argument src is required')
  }

  // JS 里面, 函数的灵活性, 是建立在这个只有一份的解析函数中要进行各种的场景判断的代价上的. 
  if (redefine === undefined) {
    // Default to true
    redefine = true
  }

  /*
  Object.getOwnPropertyNames()
   returns an array whose elements are strings corresponding to the enumerable and non-enumerable properties found directly in a given object obj. The ordering of the enumerable properties in the array is consistent with the ordering exposed by a for...in loop (or by Object.keys()) over the properties of the object. The non-negative integer keys of the object (both enumerable and non-enumerable) are added in ascending order to the array first, followed by the string keys in the order of insertion.
  */
 // Mix 的 src 一般是 proto 对象, 上面的属性都是方法. 
 // 使用 Mix 主要是想要达到 Proto, Module 的效果, 就是将方法全部定义在一个抽象类型上, 然后让一个实例免费的继承这些方法, 这样代码划分更加的清晰. 
 // JS 里面, 是使用了 defineProperty 这个特殊的方法. 和 Proto, Module 不同, 这里没有走 JS 的原型链, 而是将这些方法, 重新复制了一份到对象上. 也就是说, 这都是这个对象的实例方法了. 
  Object.getOwnPropertyNames(src).forEach(function forEachOwnPropertyName(name) {
    if (!redefine && hasOwnProperty.call(dest, name)) {
      // Skip desriptor
      return
    }

    // Copy descriptor
    var descriptor = Object.getOwnPropertyDescriptor(src, name)
    Object.defineProperty(dest, name, descriptor)
  })

  return dest
}
