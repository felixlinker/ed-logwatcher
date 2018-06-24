/**
 * @file The file that does the watcher processing.
 * @author willyb321
 * @copyright MIT
 */
/**
 * @module Watcher
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.LogWatcher = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug2.default)('ed-logwatcher');

/**
 * Interval in MS to poll directory at.
 * @type {number}
 */
var POLL_INTERVAL = 1000;
/**
 * Default path to journal files for Elite.
 * @type {string}
 */
var DEFAULT_SAVE_DIR = _path2.default.join(_os2.default.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
/**
 * @class The main class.
 * @tutorial LogWatcher-Tutorial
 */

var LogWatcher = exports.LogWatcher = function (_events$EventEmitter) {
	_inherits(LogWatcher, _events$EventEmitter);

	/**
  * Construct the log watcher.
  * @param dirpath {string} The directory to watch.
  * @param maxfiles {number} Maximum amount of files to process.
  * @param ignoreInitial {boolean} Ignore initial read or not.
  */
	function LogWatcher(dirpath, maxfiles, ignoreInitial) {
		_classCallCheck(this, LogWatcher);

		var _this = _possibleConstructorReturn(this, (LogWatcher.__proto__ || Object.getPrototypeOf(LogWatcher)).call(this));

		_this._dirpath = dirpath || DEFAULT_SAVE_DIR;
		_this._filter = isCommanderLog;
		_this._maxfiles = maxfiles || 3;
		_this._logDetailMap = {};
		_this._ops = [];
		_this._op = null;
		_this._startTime = new Date();
		_this._timer = null;
		_this._die = false;
		_this._ignoreInitial = ignoreInitial || false;
		_this.stopped = false;
		_this._loop();
		_this.emit('Started');
		return _this;
	}

	/**
  * Bury a file
  * @param filename {string} File to bury.
  */


	_createClass(LogWatcher, [{
		key: 'bury',
		value: function bury(filename) {
			debug('bury', { filename: filename });
			this._logDetailMap[filename].tombstoned = true;
		}

		/**
   * Stop running
   */

	}, {
		key: 'stop',
		value: function stop() {
			debug('stop');

			if (this._op === null) {
				clearTimeout(this._timer);
				this.stopped = true;
				this.emit('stopped');
			} else {
				this._ops.splice(this._ops.length);
				this.stopped = true;
				this._die = true;
			}
		}

		/**
   * The main loop
   */

	}, {
		key: '_loop',
		value: function _loop() {
			var _this2 = this;

			debug('_loop', { opcount: this._ops.length });

			this._op = null;

			if (this._ops.length === 0) {
				this._timer = setTimeout(function () {
					_this2._ops.push(function (callback) {
						return _this2._poll(callback);
					});
					setImmediate(function () {
						return _this2._loop();
					});
				}, POLL_INTERVAL);
				return;
			}

			this._op = this._ops.shift();

			try {
				this._op(function (err) {
					if (err) {
						_this2.emit('error', err);
					} else if (_this2._die) {
						_this2.emit('stopped');
					} else {
						setImmediate(function () {
							return _this2._loop();
						});
					}
				});
			} catch (err) {
				this.emit('error', err);
				// Assumption: it crashed BEFORE an async wait
				// otherwise, we'll end up with more simultaneous
				// activity
				setImmediate(function () {
					return _this2._loop();
				});
			}
		}

		/**
   * Poll the logs directory for new/updated files.
   * @param callback {function}
   */

	}, {
		key: '_poll',
		value: function _poll(callback) {
			var _this3 = this;

			debug('_poll');

			var unseen = {};
			Object.keys(this._logDetailMap).forEach(function (filename) {
				if (!_this3._logDetailMap[filename].tombstoned) {
					unseen[filename] = true;
				}
			});

			_fs2.default.readdir(this._dirpath, function (err, filenames) {
				if (err) {
					callback(err);
				} else {
					var counter = _this3._maxfiles;
					var tmpOps = [];

					var _loop2 = function _loop2(i) {
						var filename = _path2.default.join(_this3._dirpath, filenames[i]);
						if (_this3._filter(filename)) {
							counter--;
							delete unseen[filename];
							tmpOps.push(function (cb) {
								return _this3._statfile(filename, cb);
							});
						}
					};

					for (var i = filenames.length - 1; i >= 0 && counter; i--) {
						_loop2(i);
					}
					tmpOps.reverse().forEach(function (op) {
						return _this3._ops.push(op);
					});

					Object.keys(unseen).forEach(function (filename) {
						_this3.bury(filename);
					});

					callback(null);
				}
			});
		}

		/**
   * Stat the new/updated files in log directory
   * @param filename {string} Path to file to get stats of.
   * @param callback
   */

	}, {
		key: '_statfile',
		value: function _statfile(filename, callback) {
			var _this4 = this;

			debug('_statfile', { filename: filename });

			_fs2.default.stat(filename, function (err, stats) {
				if (err && err.code === 'ENOENT') {
					if (_this4._logDetailMap[filename]) {
						_this4.bury(filename);
					}
					callback(null); // File deleted
				} else if (err) {
					callback(err);
				} else {
					_this4._ops.push(function (cb) {
						return _this4._process(filename, stats, cb);
					});
					callback(null);
				}
			});
		}

		/**
   * Process the files
   * @param filename {string} Filename to check
   * @param stats {object} Last modified etc
   * @param callback {function}
   */

	}, {
		key: '_process',
		value: function _process(filename, stats, callback) {
			var _this5 = this;

			debug('_process', { filename: filename });
			var CURRENT_FILE = 0;
			setImmediate(callback, null);
			var info = this._logDetailMap[filename];
			if (this._ignoreInitial && stats.mtime < this._startTime) {
				return;
			}
			if (info === undefined && CURRENT_FILE < this._maxfiles) {
				this._logDetailMap[filename] = {
					ino: stats.ino,
					mtime: stats.mtime,
					size: stats.size,
					watermark: 0,
					tombstoned: false
				};
				CURRENT_FILE++;
				this._ops.push(function (cb) {
					return _this5._read(filename, cb);
				});
				return;
			}

			if (info.tombstoned) {
				return;
			}

			if (info.ino !== stats.ino) {
				// File replaced... can't trust it any more
				// if the client API supported replay from scratch, we could do that
				// but we can't yet, so:
				CURRENT_FILE = 0;
				this.bury(filename);
			} else if (stats.size > info.size) {
				// File not replaced; got longer... assume append
				this._ops.push(function (cb) {
					return _this5._read(filename, cb);
				});
			} else if (info.ino === stats.ino && info.size === stats.size) {
				// Even if mtime is different, treat it as unchanged
				// e.g. ^Z when COPY CON to a fake log
				// don't queue read
			}

			info.mtime = stats.mtime;
			info.size = stats.size;
		}

		/**
   * Read the files
   * @param filename {string} The filename to read.
   * @param callback {function}
   */

	}, {
		key: '_read',
		value: function _read(filename, callback) {
			var _this6 = this;

			var _logDetailMap$filenam = this._logDetailMap[filename],
			    watermark = _logDetailMap$filenam.watermark,
			    size = _logDetailMap$filenam.size;

			debug('_read', { filename: filename, watermark: watermark, size: size });
			var leftover = Buffer.from('', 'utf8');

			var s = _fs2.default.createReadStream(filename, {
				flags: 'r',
				start: watermark,
				end: size
			});
			var finish = function finish(err) {
				if (err) {
					// On any error, emit the error and bury the file.
					_this6.emit('error', err);
					_this6.bury(filename);
				}
				setImmediate(callback, null);
				callback = function callback() {}; // No-op
			};
			s.once('error', finish);

			s.once('end', finish);

			s.on('data', function (chunk) {
				var idx = chunk.lastIndexOf('\n');
				if (idx < 0) {
					leftover = Buffer.concat([leftover, chunk]);
				} else {
					_this6._logDetailMap[filename].watermark += idx + 1;
					try {
						var obs = Buffer.concat([leftover, chunk.slice(0, idx + 1)]).toString('utf8').replace(/\u000e/igm, '').replace(/\u000f/igm, '').split(/[\r\n]+/).filter(function (l) {
							return l.length > 0;
						}).map(function (l) {
							try {
								return JSON.parse(l);
							} catch (e) {
								debug('json.parse error', { line: l });
							}
						});
						leftover = chunk.slice(idx + 1);
						if (obs) {
							debug('data emit');
							setImmediate(function () {
								return _this6.emit('data', obs) && _this6.emit('finished');
							});
						} else {
							debug('data emit');
							setImmediate(function () {
								return _this6.emit('data', {}) && _this6.emit('finished');
							});
						}
					} catch (err) {
						finish(err);
					}
				}
			});
		}
	}]);

	return LogWatcher;
}(_events2.default.EventEmitter);
/**
 * Get the path of the logs.
 * @param fpath {string} Path to check.
 * @returns {boolean} True if the directory contains journal files.
 */


function isCommanderLog(fpath) {
	var base = _path2.default.basename(fpath);
	return base.indexOf('Journal.') === 0 && _path2.default.extname(fpath) === '.log';
}

if (!module.parent) {
	process.on('uncaughtException', function (err) {
		console.error(err.stack || err);
		throw new Error(err.stack || err);
	});

	var watcher = new LogWatcher(DEFAULT_SAVE_DIR, 3, true);
	watcher.on('error', function (err) {
		watcher.stop();
		console.error(err.stack || err);
		throw new Error(err.stack || err);
	});
	watcher.on('data', function (obs) {
		obs.forEach(function (ob) {
			var timestamp = ob.timestamp,
			    event = ob.event;

			console.log('\n' + timestamp, event);
			delete ob.timestamp;
			delete ob.event;
			Object.keys(ob).sort().forEach(function (k) {
				// console.log('\t' + k, ob[k]);
			});
		});
	});
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2ctd2F0Y2hlci5qcyJdLCJuYW1lcyI6WyJkZWJ1ZyIsIlBPTExfSU5URVJWQUwiLCJERUZBVUxUX1NBVkVfRElSIiwiam9pbiIsImhvbWVkaXIiLCJMb2dXYXRjaGVyIiwiZGlycGF0aCIsIm1heGZpbGVzIiwiaWdub3JlSW5pdGlhbCIsIl9kaXJwYXRoIiwiX2ZpbHRlciIsImlzQ29tbWFuZGVyTG9nIiwiX21heGZpbGVzIiwiX2xvZ0RldGFpbE1hcCIsIl9vcHMiLCJfb3AiLCJfc3RhcnRUaW1lIiwiRGF0ZSIsIl90aW1lciIsIl9kaWUiLCJfaWdub3JlSW5pdGlhbCIsInN0b3BwZWQiLCJfbG9vcCIsImVtaXQiLCJmaWxlbmFtZSIsInRvbWJzdG9uZWQiLCJjbGVhclRpbWVvdXQiLCJzcGxpY2UiLCJsZW5ndGgiLCJvcGNvdW50Iiwic2V0VGltZW91dCIsInB1c2giLCJfcG9sbCIsImNhbGxiYWNrIiwic2V0SW1tZWRpYXRlIiwic2hpZnQiLCJlcnIiLCJ1bnNlZW4iLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsInJlYWRkaXIiLCJmaWxlbmFtZXMiLCJjb3VudGVyIiwidG1wT3BzIiwiaSIsIl9zdGF0ZmlsZSIsImNiIiwicmV2ZXJzZSIsIm9wIiwiYnVyeSIsInN0YXQiLCJzdGF0cyIsImNvZGUiLCJfcHJvY2VzcyIsIkNVUlJFTlRfRklMRSIsImluZm8iLCJtdGltZSIsInVuZGVmaW5lZCIsImlubyIsInNpemUiLCJ3YXRlcm1hcmsiLCJfcmVhZCIsImxlZnRvdmVyIiwiQnVmZmVyIiwiZnJvbSIsInMiLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmxhZ3MiLCJzdGFydCIsImVuZCIsImZpbmlzaCIsIm9uY2UiLCJvbiIsImlkeCIsImNodW5rIiwibGFzdEluZGV4T2YiLCJjb25jYXQiLCJvYnMiLCJzbGljZSIsInRvU3RyaW5nIiwicmVwbGFjZSIsInNwbGl0IiwiZmlsdGVyIiwibCIsIm1hcCIsIkpTT04iLCJwYXJzZSIsImUiLCJsaW5lIiwiRXZlbnRFbWl0dGVyIiwiZnBhdGgiLCJiYXNlIiwiYmFzZW5hbWUiLCJpbmRleE9mIiwiZXh0bmFtZSIsIm1vZHVsZSIsInBhcmVudCIsInByb2Nlc3MiLCJjb25zb2xlIiwiZXJyb3IiLCJzdGFjayIsIkVycm9yIiwid2F0Y2hlciIsInN0b3AiLCJ0aW1lc3RhbXAiLCJvYiIsImV2ZW50IiwibG9nIiwic29ydCJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0FBS0E7OztBQUdBOzs7Ozs7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7Ozs7Ozs7Ozs7QUFFQSxJQUFNQSxRQUFRLHFCQUFPLGVBQVAsQ0FBZDs7QUFHQTs7OztBQUlBLElBQU1DLGdCQUFnQixJQUF0QjtBQUNBOzs7O0FBSUEsSUFBTUMsbUJBQW1CLGVBQUtDLElBQUwsQ0FDeEIsYUFBR0MsT0FBSCxFQUR3QixFQUV4QixhQUZ3QixFQUd4Qix1QkFId0IsRUFJeEIsaUJBSndCLENBQXpCO0FBTUE7Ozs7O0lBSWFDLFUsV0FBQUEsVTs7O0FBQ1o7Ozs7OztBQU1BLHFCQUFZQyxPQUFaLEVBQXFCQyxRQUFyQixFQUErQkMsYUFBL0IsRUFBOEM7QUFBQTs7QUFBQTs7QUFHN0MsUUFBS0MsUUFBTCxHQUFnQkgsV0FBV0osZ0JBQTNCO0FBQ0EsUUFBS1EsT0FBTCxHQUFlQyxjQUFmO0FBQ0EsUUFBS0MsU0FBTCxHQUFpQkwsWUFBWSxDQUE3QjtBQUNBLFFBQUtNLGFBQUwsR0FBcUIsRUFBckI7QUFDQSxRQUFLQyxJQUFMLEdBQVksRUFBWjtBQUNBLFFBQUtDLEdBQUwsR0FBVyxJQUFYO0FBQ0EsUUFBS0MsVUFBTCxHQUFrQixJQUFJQyxJQUFKLEVBQWxCO0FBQ0EsUUFBS0MsTUFBTCxHQUFjLElBQWQ7QUFDQSxRQUFLQyxJQUFMLEdBQVksS0FBWjtBQUNBLFFBQUtDLGNBQUwsR0FBc0JaLGlCQUFpQixLQUF2QztBQUNBLFFBQUthLE9BQUwsR0FBZSxLQUFmO0FBQ0EsUUFBS0MsS0FBTDtBQUNBLFFBQUtDLElB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QUFROUIsRUFBUixDQUFXLE1BQVgsRUFBbUIsZUFBTztBQUN6QkssTUFBSXRDLE9BQUosQ0FBWSxjQUFNO0FBQUEsT0FDVmlFLFNBRFUsR0FDVUMsRUFEVixDQUNWRCxTQURVO0FBQUEsT0FDQ0UsS0FERCxHQUNVRCxFQURWLENBQ0NDLEtBREQ7O0FBRWpCUixXQUFRUyxHQUFSLENBQVksT0FBT0gsU0FBbkIsRUFBOEJFLEtBQTlCO0FBQ0EsVUFBT0QsR0FBR0QsU0FBVjtBQUNBLFVBQU9DLEdBQUdDLEtBQVY7QUFDQXJFLFVBQU9DLElBQVAsQ0FBWW1FLEVBQVosRUFBZ0JHLElBQWhCLEdBQXVCckUsT0FBdkIsQ0FBK0IsYUFBSztBQUNuQztBQUNBLElBRkQ7QUFHQSxHQVJEO0FBU0EsRUFWRDtBQVdBIiwiZmlsZSI6ImxvZy13YXRjaGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEBmaWxlIFRoZSBmaWxlIHRoYXQgZG9lcyB0aGUgd2F0Y2hlciBwcm9jZXNzaW5nLlxyXG4gKiBAYXV0aG9yIHdpbGx5YjMyMVxyXG4gKiBAY29weXJpZ2h0IE1JVFxyXG4gKi9cclxuLyoqXHJcbiAqIEBtb2R1bGUgV2F0Y2hlclxyXG4gKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5pbXBvcnQgZXZlbnRzIGZyb20gJ2V2ZW50cyc7XHJcbmltcG9ydCBvcyBmcm9tICdvcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgZGVidWcwIGZyb20gJ2RlYnVnJztcclxuXHJcbmNvbnN0IGRlYnVnID0gZGVidWcwKCdlZC1sb2d3YXRjaGVyJyk7XHJcblxyXG5cclxuLyoqXHJcbiAqIEludGVydmFsIGluIE1TIHRvIHBvbGwgZGlyZWN0b3J5IGF0LlxyXG4gKiBAdHlwZSB7bnVtYmVyfVxyXG4gKi9cclxuY29uc3QgUE9MTF9JTlRFUlZBTCA9IDEwMDA7XHJcbi8qKlxyXG4gKiBEZWZhdWx0IHBhdGggdG8gam91cm5hbCBmaWxlcyBmb3IgRWxpdGUuXHJcbiAqIEB0eXBlIHtzdHJpbmd9XHJcbiAqL1xyXG5jb25zdCBERUZBVUxUX1NBVkVfRElSID0gcGF0aC5qb2luKFxyXG5cdG9zLmhvbWVkaXIoKSxcclxuXHQnU2F2ZWQgR2FtZXMnLFxyXG5cdCdGcm9udGllciBEZXZlbG9wbWVudHMnLFxyXG5cdCdFbGl0ZSBEYW5nZXJvdXMnXHJcbik7XHJcbi8qKlxyXG4gKiBAY2xhc3MgVGhlIG1haW4gY2xhc3MuXHJcbiAqIEB0dXRvcmlhbCBMb2dXYXRjaGVyLVR1dG9yaWFsXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTG9nV2F0Y2hlciBleHRlbmRzIGV2ZW50cy5FdmVudEVtaXR0ZXIge1xyXG5cdC8qKlxyXG5cdCAqIENvbnN0cnVjdCB0aGUgbG9nIHdhdGNoZXIuXHJcblx0ICogQHBhcmFtIGRpcnBhdGgge3N0cmluZ30gVGhlIGRpcmVjdG9yeSB0byB3YXRjaC5cclxuXHQgKiBAcGFyYW0gbWF4ZmlsZXMge251bWJlcn0gTWF4aW11bSBhbW91bnQgb2YgZmlsZXMgdG8gcHJvY2Vzcy5cclxuXHQgKiBAcGFyYW0gaWdub3JlSW5pdGlhbCB7Ym9vbGVhbn0gSWdub3JlIGluaXRpYWwgcmVhZCBvciBub3QuXHJcblx0ICovXHJcblx0Y29uc3RydWN0b3IoZGlycGF0aCwgbWF4ZmlsZXMsIGlnbm9yZUluaXRpYWwpIHtcclxuXHRcdHN1cGVyKCk7XHJcblxyXG5cdFx0dGhpcy5fZGlycGF0aCA9IGRpcnBhdGggfHwgREVGQVVMVF9TQVZFX0RJUjtcclxuXHRcdHRoaXMuX2ZpbHRlciA9IGlzQ29tbWFuZGVyTG9nO1xyXG5cdFx0dGhpcy5fbWF4ZmlsZXMgPSBtYXhmaWxlcyB8fCAzO1xyXG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwID0ge307XHJcblx0XHR0aGlzLl9vcHMgPSBbXTtcclxuXHRcdHRoaXMuX29wID0gbnVsbDtcclxuXHRcdHRoaXMuX3N0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XHJcblx0XHR0aGlzLl90aW1lciA9IG51bGw7XHJcblx0XHR0aGlzLl9kaWUgPSBmYWxzZTtcclxuXHRcdHRoaXMuX2lnbm9yZUluaXRpYWwgPSBpZ25vcmVJbml0aWFsIHx8IGZhbHNlO1xyXG5cdFx0dGhpcy5zdG9wcGVkID0gZmFsc2U7XHJcblx0XHR0aGlzLl9sb29wKCk7XHJcblx0XHR0aGlzLmVtaXQoJ1N0YXJ0ZWQnKTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIEJ1cnkgYSBmaWxlXHJcblx0ICogQHBhcmFtIGZpbGVuYW1lIHtzdHJpbmd9IEZpbGUgdG8gYnVyeS5cclxuXHQgKi9cclxuXHRidXJ5KGZpbGVuYW1lKSB7XHJcblx0XHRkZWJ1ZygnYnVyeScsIHtmaWxlbmFtZX0pO1xyXG5cdFx0dGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXS50b21ic3RvbmVkID0gdHJ1ZTtcclxuXHR9XHJcblxyXG5cdC8qKlxyXG5cdCAqIFN0b3AgcnVubmluZ1xyXG5cdCAqL1xyXG5cdHN0b3AoKSB7XHJcblx0XHRkZWJ1Zygnc3RvcCcpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9vcCA9PT0gbnVsbCkge1xyXG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdGltZXIpO1xyXG5cdFx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLmVtaXQoJ3N0b3BwZWQnKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX29wcy5zcGxpY2UodGhpcy5fb3BzLmxlbmd0aCk7XHJcblx0XHRcdHRoaXMuc3RvcHBlZCA9IHRydWU7XHJcblx0XHRcdHRoaXMuX2RpZSA9IHRydWU7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBUaGUgbWFpbiBsb29wXHJcblx0ICovXHJcblx0X2xvb3AoKSB7XHJcblx0XHRkZWJ1ZygnX2xvb3AnLCB7b3Bjb3VudDogdGhpcy5fb3BzLmxlbmd0aH0pO1xyXG5cclxuXHRcdHRoaXMuX29wID0gbnVsbDtcclxuXHJcblx0XHRpZiAodGhpcy5fb3BzLmxlbmd0aCA9PT0gMCkge1xyXG5cdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG5cdFx0XHRcdHRoaXMuX29wcy5wdXNoKGNhbGxiYWNrID0+IHRoaXMuX3BvbGwoY2FsbGJhY2spKTtcclxuXHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcclxuXHRcdFx0fSwgUE9MTF9JTlRFUlZBTCk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9vcCA9IHRoaXMuX29wcy5zaGlmdCgpO1xyXG5cclxuXHRcdHRyeSB7XHJcblx0XHRcdHRoaXMuX29wKGVyciA9PiB7XHJcblx0XHRcdFx0aWYgKGVycikge1xyXG5cdFx0XHRcdFx0dGhpcy5lbWl0KCdlcnJvcicsIGVycik7XHJcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kaWUpIHtcclxuXHRcdFx0XHRcdHRoaXMuZW1pdCgnc3RvcHBlZCcpO1xyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRzZXRJbW1lZGlhdGUoKCkgPT4gdGhpcy5fbG9vcCgpKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdFx0fSBjYXRjaCAoZXJyKSB7XHJcblx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG5cdFx0XHRcdC8vIEFzc3VtcHRpb246IGl0IGNyYXNoZWQgQkVGT1JFIGFuIGFzeW5jIHdhaXRcclxuXHRcdFx0XHQvLyBvdGhlcndpc2UsIHdlJ2xsIGVuZCB1cCB3aXRoIG1vcmUgc2ltdWx0YW5lb3VzXHJcblx0XHRcdFx0Ly8gYWN0aXZpdHlcclxuXHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuX2xvb3AoKSk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBQb2xsIHRoZSBsb2dzIGRpcmVjdG9yeSBmb3IgbmV3L3VwZGF0ZWQgZmlsZXMuXHJcblx0ICogQHBhcmFtIGNhbGxiYWNrIHtmdW5jdGlvbn1cclxuXHQgKi9cclxuXHRfcG9sbChjYWxsYmFjaykge1xyXG5cdFx0ZGVidWcoJ19wb2xsJyk7XHJcblxyXG5cdFx0Y29uc3QgdW5zZWVuID0ge307XHJcblx0XHRPYmplY3Qua2V5cyh0aGlzLl9sb2dEZXRhaWxNYXApLmZvckVhY2goZmlsZW5hbWUgPT4ge1xyXG5cdFx0XHRpZiAoIXRoaXMuX2xvZ0RldGFpbE1hcFtmaWxlbmFtZV0udG9tYnN0b25lZCkge1xyXG5cdFx0XHRcdHVuc2VlbltmaWxlbmFtZV0gPSB0cnVlO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHRmcy5yZWFkZGlyKHRoaXMuX2RpcnBhdGgsIChlcnIsIGZpbGVuYW1lcykgPT4ge1xyXG5cdFx0XHRpZiAoZXJyKSB7XHJcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRsZXQgY291bnRlciA9IHRoaXMuX21heGZpbGVzO1xyXG5cdFx0XHRcdGxldCB0bXBPcHMgPSBbXTtcclxuXHRcdFx0XHRmb3IgKGxldCBpID0gZmlsZW5hbWVzLmxlbmd0aCAtIDE7IGkgPj0gMCAmJiBjb3VudGVyOyBpLS0pIHtcclxuXHRcdFx0XHRcdGxldCBmaWxlbmFtZSA9IHBhdGguam9pbih0aGlzLl9kaXJwYXRoLCBmaWxlbmFtZXNbaV0pO1xyXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2ZpbHRlcihmaWxlbmFtZSkpIHtcclxuXHRcdFx0XHRcdFx0Y291bnRlci0tO1xyXG5cdFx0XHRcdFx0XHRkZWxldGUgdW5zZWVuW2ZpbGVuYW1lXTtcclxuXHRcdFx0XHRcdFx0dG1wT3BzLnB1c2goY2IgPT4gdGhpcy5fc3RhdGZpbGUoZmlsZW5hbWUsIGNiKSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHRtcE9wcy5yZXZlcnNlKCkuZm9yRWFjaChvcCA9PiB0aGlzLl9vcHMucHVzaChvcCkpO1xyXG5cclxuXHRcdFx0XHRPYmplY3Qua2V5cyh1bnNlZW4pLmZvckVhY2goZmlsZW5hbWUgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5idXJ5KGZpbGVuYW1lKTtcclxuXHRcdFx0XHR9KTtcclxuXHJcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0LyoqXHJcblx0ICogU3RhdCB0aGUgbmV3L3VwZGF0ZWQgZmlsZXMgaW4gbG9nIGRpcmVjdG9yeVxyXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBQYXRoIHRvIGZpbGUgdG8gZ2V0IHN0YXRzIG9mLlxyXG5cdCAqIEBwYXJhbSBjYWxsYmFja1xyXG5cdCAqL1xyXG5cdF9zdGF0ZmlsZShmaWxlbmFtZSwgY2FsbGJhY2spIHtcclxuXHRcdGRlYnVnKCdfc3RhdGZpbGUnLCB7ZmlsZW5hbWV9KTtcclxuXHJcblx0XHRmcy5zdGF0KGZpbGVuYW1lLCAoZXJyLCBzdGF0cykgPT4ge1xyXG5cdFx0XHRpZiAoZXJyICYmIGVyci5jb2RlID09PSAnRU5PRU5UJykge1xyXG5cdFx0XHRcdGlmICh0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdKSB7XHJcblx0XHRcdFx0XHR0aGlzLmJ1cnkoZmlsZW5hbWUpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTsgLy8gRmlsZSBkZWxldGVkXHJcblx0XHRcdH0gZWxzZSBpZiAoZXJyKSB7XHJcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl9vcHMucHVzaChjYiA9PiB0aGlzLl9wcm9jZXNzKGZpbGVuYW1lLCBzdGF0cywgY2IpKTtcclxuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBQcm9jZXNzIHRoZSBmaWxlc1xyXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBGaWxlbmFtZSB0byBjaGVja1xyXG5cdCAqIEBwYXJhbSBzdGF0cyB7b2JqZWN0fSBMYXN0IG1vZGlmaWVkIGV0Y1xyXG5cdCAqIEBwYXJhbSBjYWxsYmFjayB7ZnVuY3Rpb259XHJcblx0ICovXHJcblx0X3Byb2Nlc3MoZmlsZW5hbWUsIHN0YXRzLCBjYWxsYmFjaykge1xyXG5cdFx0ZGVidWcoJ19wcm9jZXNzJywge2ZpbGVuYW1lfSk7XHJcblx0XHRsZXQgQ1VSUkVOVF9GSUxFID0gMDtcclxuXHRcdHNldEltbWVkaWF0ZShjYWxsYmFjaywgbnVsbCk7XHJcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fbG9nRGV0YWlsTWFwW2ZpbGVuYW1lXTtcclxuXHRcdGlmICh0aGlzLl9pZ25vcmVJbml0aWFsICYmIHN0YXRzLm10aW1lIDwgdGhpcy5fc3RhcnRUaW1lKSB7XHJcblx0XHRcdHJldHVyblxyXG5cdFx0fVxyXG5cdFx0aWYgKGluZm8gPT09IHVuZGVmaW5lZCAmJiBDVVJSRU5UX0ZJTEUgPCB0aGlzLl9tYXhmaWxlcykge1xyXG5cdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdID0ge1xyXG5cdFx0XHRcdGlubzogc3RhdHMuaW5vLFxyXG5cdFx0XHRcdG10aW1lOiBzdGF0cy5tdGltZSxcclxuXHRcdFx0XHRzaXplOiBzdGF0cy5zaXplLFxyXG5cdFx0XHRcdHdhdGVybWFyazogMCxcclxuXHRcdFx0XHR0b21ic3RvbmVkOiBmYWxzZVxyXG5cdFx0XHR9O1xyXG5cdFx0XHRDVVJSRU5UX0ZJTEUrKztcclxuXHRcdFx0dGhpcy5fb3BzLnB1c2goY2IgPT4gdGhpcy5fcmVhZChmaWxlbmFtZSwgY2IpKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChpbmZvLnRvbWJzdG9uZWQpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChpbmZvLmlubyAhPT0gc3RhdHMuaW5vKSB7XHJcblx0XHRcdFx0Ly8gRmlsZSByZXBsYWNlZC4uLiBjYW4ndCB0cnVzdCBpdCBhbnkgbW9yZVxyXG5cdFx0XHRcdC8vIGlmIHRoZSBjbGllbnQgQVBJIHN1cHBvcnRlZCByZXBsYXkgZnJvbSBzY3JhdGNoLCB3ZSBjb3VsZCBkbyB0aGF0XHJcblx0XHRcdFx0Ly8gYnV0IHdlIGNhbid0IHlldCwgc286XHJcblx0XHRcdENVUlJFTlRfRklMRSA9IDA7XHJcblx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XHJcblx0XHR9IGVsc2UgaWYgKHN0YXRzLnNpemUgPiBpbmZvLnNpemUpIHtcclxuXHRcdFx0XHQvLyBGaWxlIG5vdCByZXBsYWNlZDsgZ290IGxvbmdlci4uLiBhc3N1bWUgYXBwZW5kXHJcblx0XHRcdHRoaXMuX29wcy5wdXNoKGNiID0+IHRoaXMuX3JlYWQoZmlsZW5hbWUsIGNiKSk7XHJcblx0XHR9IGVsc2UgaWYgKGluZm8uaW5vID09PSBzdGF0cy5pbm8gJiYgaW5mby5zaXplID09PSBzdGF0cy5zaXplKSB7XHJcblx0XHRcdFx0Ly8gRXZlbiBpZiBtdGltZSBpcyBkaWZmZXJlbnQsIHRyZWF0IGl0IGFzIHVuY2hhbmdlZFxyXG5cdFx0XHRcdC8vIGUuZy4gXlogd2hlbiBDT1BZIENPTiB0byBhIGZha2UgbG9nXHJcblx0XHRcdFx0Ly8gZG9uJ3QgcXVldWUgcmVhZFxyXG5cdFx0fVxyXG5cclxuXHRcdGluZm8ubXRpbWUgPSBzdGF0cy5tdGltZTtcclxuXHRcdGluZm8uc2l6ZSA9IHN0YXRzLnNpemU7XHJcblx0fVxyXG5cclxuXHQvKipcclxuXHQgKiBSZWFkIHRoZSBmaWxlc1xyXG5cdCAqIEBwYXJhbSBmaWxlbmFtZSB7c3RyaW5nfSBUaGUgZmlsZW5hbWUgdG8gcmVhZC5cclxuXHQgKiBAcGFyYW0gY2FsbGJhY2sge2Z1bmN0aW9ufVxyXG5cdCAqL1xyXG5cdF9yZWFkKGZpbGVuYW1lLCBjYWxsYmFjaykge1xyXG5cdFx0Y29uc3Qge3dhdGVybWFyaywgc2l6ZX0gPSB0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdO1xyXG5cdFx0ZGVidWcoJ19yZWFkJywge2ZpbGVuYW1lLCB3YXRlcm1hcmssIHNpemV9KTtcclxuXHRcdGxldCBsZWZ0b3ZlciA9IEJ1ZmZlci5mcm9tKCcnLCAndXRmOCcpO1xyXG5cclxuXHRcdGNvbnN0IHMgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKGZpbGVuYW1lLCB7XHJcblx0XHRcdGZsYWdzOiAncicsXHJcblx0XHRcdHN0YXJ0OiB3YXRlcm1hcmssXHJcblx0XHRcdGVuZDogc2l6ZVxyXG5cdFx0fSk7XHJcblx0XHRjb25zdCBmaW5pc2ggPSBlcnIgPT4ge1xyXG5cdFx0XHRpZiAoZXJyKSB7XHJcblx0XHRcdFx0XHQvLyBPbiBhbnkgZXJyb3IsIGVtaXQgdGhlIGVycm9yIGFuZCBidXJ5IHRoZSBmaWxlLlxyXG5cdFx0XHRcdHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG5cdFx0XHRcdHRoaXMuYnVyeShmaWxlbmFtZSk7XHJcblx0XHRcdH1cclxuXHRcdFx0c2V0SW1tZWRpYXRlKGNhbGxiYWNrLCBudWxsKTtcclxuXHRcdFx0Y2FsbGJhY2sgPSAoKSA9PiB7XHJcblx0XHRcdH07IC8vIE5vLW9wXHJcblx0XHR9O1xyXG5cdFx0cy5vbmNlKCdlcnJvcicsIGZpbmlzaCk7XHJcblxyXG5cdFx0cy5vbmNlKCdlbmQnLCBmaW5pc2gpO1xyXG5cclxuXHRcdHMub24oJ2RhdGEnLCBjaHVuayA9PiB7XHJcblx0XHRcdFx0Y29uc3QgaWR4ID0gY2h1bmsubGFzdEluZGV4T2YoJ1xcbicpO1xyXG5cdFx0XHRcdGlmIChpZHggPCAwKSB7XHJcblx0XHRcdFx0XHRsZWZ0b3ZlciA9IEJ1ZmZlci5jb25jYXQoW2xlZnRvdmVyLCBjaHVua10pO1xyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHR0aGlzLl9sb2dEZXRhaWxNYXBbZmlsZW5hbWVdLndhdGVybWFyayArPSBpZHggKyAxO1xyXG5cdFx0XHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRcdFx0Y29uc3Qgb2JzID0gQnVmZmVyLmNvbmNhdChbbGVmdG92ZXIsIGNodW5rLnNsaWNlKDAsIGlkeCArIDEpXSlcclxuXHRcdFx0XHRcdFx0XHQudG9TdHJpbmcoJ3V0ZjgnKVxyXG5cdFx0XHRcdFx0XHRcdC5yZXBsYWNlKC9cXHUwMDBlL2lnbSwgJycpXHJcblx0XHRcdFx0XHRcdFx0LnJlcGxhY2UoL1xcdTAwMGYvaWdtLCAnJylcclxuXHRcdFx0XHRcdFx0XHQuc3BsaXQoL1tcXHJcXG5dKy8pXHJcblx0XHRcdFx0XHRcdFx0LmZpbHRlcihsID0+IGwubGVuZ3RoID4gMClcclxuXHRcdFx0XHRcdFx0XHQubWFwKGwgPT4ge1xyXG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UobClcclxuXHRcdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVidWcoJ2pzb24ucGFyc2UgZXJyb3InLCB7bGluZTogbH0pO1xyXG5cdFx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdH0pO1xyXG5cdFx0XHRcdFx0XHRsZWZ0b3ZlciA9IGNodW5rLnNsaWNlKGlkeCArIDEpO1xyXG5cdFx0XHRcdFx0XHRpZiAob2JzKSB7XHJcblx0XHRcdFx0XHRcdFx0ZGVidWcoJ2RhdGEgZW1pdCcpO1xyXG5cdFx0XHRcdFx0XHRcdHNldEltbWVkaWF0ZSgoKSA9PiB0aGlzLmVtaXQoJ2RhdGEnLCBvYnMpICYmIHRoaXMuZW1pdCgnZmluaXNoZWQnKSk7XHJcblx0XHRcdFx0XHRcdH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWJ1ZygnZGF0YSBlbWl0Jyk7XHJcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHRoaXMuZW1pdCgnZGF0YScsIHt9KSAmJiB0aGlzLmVtaXQoJ2ZpbmlzaGVkJykpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcclxuXHRcdFx0XHRcdFx0ZmluaXNoKGVycik7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHR9XHJcbn1cclxuLyoqXHJcbiAqIEdldCB0aGUgcGF0aCBvZiB0aGUgbG9ncy5cclxuICogQHBhcmFtIGZwYXRoIHtzdHJpbmd9IFBhdGggdG8gY2hlY2suXHJcbiAqIEByZXR1cm5zIHtib29sZWFufSBUcnVlIGlmIHRoZSBkaXJlY3RvcnkgY29udGFpbnMgam91cm5hbCBmaWxlcy5cclxuICovXHJcbmZ1bmN0aW9uIGlzQ29tbWFuZGVyTG9nKGZwYXRoKSB7XHJcblx0Y29uc3QgYmFzZSA9IHBhdGguYmFzZW5hbWUoZnBhdGgpO1xyXG5cdHJldHVybiBiYXNlLmluZGV4T2YoJ0pvdXJuYWwuJykgPT09IDAgJiYgcGF0aC5leHRuYW1lKGZwYXRoKSA9PT0gJy5sb2cnO1xyXG59XHJcblxyXG5pZiAoIW1vZHVsZS5wYXJlbnQpIHtcclxuXHRwcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XHJcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xyXG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xyXG5cdH0pO1xyXG5cclxuXHRjb25zdCB3YXRjaGVyID0gbmV3IExvZ1dhdGNoZXIoREVGQVVMVF9TQVZFX0RJUiwgMywgdHJ1ZSk7XHJcblx0d2F0Y2hlci5vbignZXJyb3InLCBlcnIgPT4ge1xyXG5cdFx0d2F0Y2hlci5zdG9wKCk7XHJcblx0XHRjb25zb2xlLmVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xyXG5cdFx0dGhyb3cgbmV3IEVycm9yKGVyci5zdGFjayB8fCBlcnIpO1xyXG5cdH0pO1xyXG5cdHdhdGNoZXIub24oJ2RhdGEnLCBvYnMgPT4ge1xyXG5cdFx0b2JzLmZvckVhY2gob2IgPT4ge1xyXG5cdFx0XHRjb25zdCB7dGltZXN0YW1wLCBldmVudH0gPSBvYjtcclxuXHRcdFx0Y29uc29sZS5sb2coJ1xcbicgKyB0aW1lc3RhbXAsIGV2ZW50KTtcclxuXHRcdFx0ZGVsZXRlIG9iLnRpbWVzdGFtcDtcclxuXHRcdFx0ZGVsZXRlIG9iLmV2ZW50O1xyXG5cdFx0XHRPYmplY3Qua2V5cyhvYikuc29ydCgpLmZvckVhY2goayA9PiB7XHJcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coJ1xcdCcgKyBrLCBvYltrXSk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fSk7XHJcblx0fSk7XHJcbn1cclxuIl19
