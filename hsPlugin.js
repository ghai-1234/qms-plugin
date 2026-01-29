/**
 * HS Plugin helper for external plugins
 * @author Nachiket Kakatkar <nachiket@helpshift.com>
 * @created Oct 27, 2024
 */

(function (win) {
  const HOST_ORIGIN_QUERY_PARAM = "orig";

  /**
   * APIs provided by Helpshift plugins system
   */
  const SUPPORTED_APIS = {
    LOGIN: "login",
    ADD_EVENT_LISTENER: "addEventListener"
  };

  /**
   * Events accepted by the Helpshift plugins system
   */
  const SUPPORTED_HOST_EVENTS = {
    LOGIN: "LOGIN",
    PLUGIN_HIDDEN: "plugin-hidden",
    PLUGIN_SHOWN: "plugin-shown"
  };

  /**
   * Events accepted by the Helpshift plugins system
   */
  const PLUGIN_LISTENABLE_EVENTS = {
    PLUGIN_HIDDEN: "plugin-hidden",
    PLUGIN_SHOWN: "plugin-shown"
  };

  /**
   * Sequence of communication from Plugin -> HS -> Plugin
   * 1.) Plugin calls an API, which gets an async response. This call includes API name
   * and request ID
   * 2.) HS Dashboard intercepts this, and makes the API call, and has its own callback for the
   * request ID
   * 3.) Once the async API call returns, it postMessage back the response with the request ID
   * and API name
   * 4.) The plugin intercepts the postMessage from HS Dashboard, it will have the request ID
   * 5.) It will use the request ID to invoke the callback
   */

  /**
   * Returns host origin from search query param after
   * parsing the current doc URL. Throws an error if the
   * origin is not found
   * @returns {string} - The host origin
   */
  const _getHostOrigin = () => {
    const addr = new URL(win.location.href);

    try {
      return addr.searchParams.get(HOST_ORIGIN_QUERY_PARAM);
    } catch (err) {
      // eslint-disable-next-line
      console.error(err);
    }
  };

  /**
   * Util to send msg to give host with given payload
   * @param {string} targetOrigin - Origin to which msg is to be sent
   * @param {Object} payload - payload to be sent with the msg
   */
  const _postMessage = (targetOrigin, payload) => {
    const {parent: parentWindow} = win;

    try {
      parentWindow.postMessage(JSON.stringify(payload), targetOrigin);
    } catch (e) {
      // eslint-disable-next-line
      console.error("Error while parsing post message response : ", e);
    }
  };

  /**
   * Adds listener for the given origin. Does not invoke the callback
   * if the msg is not from the given origin
   *
   * @param {string} origin - Origin from which msg is expected
   * @param {function} callback - Callback to be invoke when msg
   * is received
   */
  const _startListeningToHost = (origin, callback) => {
    win.addEventListener(
      "message",
      (event) => {
        if (event.origin !== origin) {
          return;
        }

        if (callback) {
          callback(event);
        }
      },
      origin
    );
  };

  /**
   * Map of request ids against callbacks. This will be used
   * to keep record to callback that should be called when
   * requests are invoked from plugin to host
   */
  const _requestListeners = {};

  /**
   * Registers the given callback for the given requestId.
   * @param {number} requestId - Unique identifier for the request
   * @param {Function} callback - Function to be invoked when response
   * is received
   */
  const _registerListenerForRequest = (requestId, callback) => {
    _requestListeners[requestId] = callback;
  };

  /**
   * Event listeners map used for addEventListener API
   */
  const _eventListeners = {};

  /**
   * Invokes the callbacks for the given event with the given payload.
   * @param {string} eventName - Event for which callbacks will be invoked
   * @param {Object} payload - The payload to be passed to the callback
   */
  const _invokeEventListeners = (eventName, payload) => {
    const callbacks = _eventListeners[eventName];

    if (callbacks?.length) {
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          // eslint-disable-next-line
          console.error(`Error while invoking callback for event : ${eventName}`);
        }
      });
    }
  };

  /**
   * Initializes the communication layer between host and plugin
   */
  const _init = () => {
    const hostOrigin = _getHostOrigin();

    if (!hostOrigin) {
      throw new Error("Host origin not available, cannot load plugin");
    }

    _startListeningToHost(hostOrigin, (event) => {
      try {
        const payload = JSON.parse(event.data);
        const {requestId, name: eventName} = payload;

        if (!Object.values(SUPPORTED_HOST_EVENTS).includes(eventName)) {
          return;
        }

        // Request id would be present only for async calls to the host system. So
        // payload without requestId would mean an event listened for using the
        // "addEventListener" API
        if (!requestId) {
          _invokeEventListeners(eventName, payload);
        } else if (_requestListeners[requestId]) {
          try {
            _requestListeners[requestId](payload);
            delete _requestListeners[requestId];
          } catch (e) {
            const errorDetails = {
              requestId,
              eventName,
              error: e
            };

            // eslint-disable-next-line
            console.error("Error while invoking callback. Details : ", errorDetails);
          }
        }
      } catch (e) {
        // eslint-disable-next-line
        console.error("Error while parsing message from host ", e);
      }
    });

    /**
     * Supported APIs on the HSPLUGIN inteface
     */
    const _hsPluginApis = {
      /**
       * Login API - Logs in using the auth from host iframe
       * @param {Function} onSuccess - Handler for successful login
       * @param {Function} onFailure - Handler for login failure
       */
      login(onSuccess, onFailure) {
        const requestId = Date.now();

        _postMessage(hostOrigin, {
          type: SUPPORTED_HOST_EVENTS.LOGIN,
          data: {
            requestId
          }
        });

        _registerListenerForRequest(requestId, (message) => {
          const {data} = message;

          if ((data.error || !data.token) && onFailure) {
            if (onFailure) {
              onFailure(data.error);
            }

            // eslint-disable-next-line
            console.error("Error in login API ", data.error);
          } else if (onSuccess && data.token) {
            onSuccess(data);
          }
        });
      },

      /**
       * Registers the callback for the given event name
       * @param {string}} eventName - The name of the event
       * @param {Function} callback - Callback invoked when event occurs
       */
      addEventListener(eventName, callback) {
        if (!Object.values(PLUGIN_LISTENABLE_EVENTS).includes(eventName)) {
          return;
        }

        if (!_eventListeners[eventName]) {
          _eventListeners[eventName] = [];
        }

        _eventListeners[eventName].push(callback);
      }
    };

    // APIs interface to be used by the plugin app
    win.HSPLUGIN = (apiName, apiArgs = {}) => {
      switch (apiName) {
        case SUPPORTED_APIS.LOGIN:
          _hsPluginApis.login.call(null, apiArgs.onSuccess, apiArgs.onFailure);
          break;

        case SUPPORTED_APIS.ADD_EVENT_LISTENER:
          _hsPluginApis.addEventListener.call(null, apiArgs.eventName, apiArgs.callback);
          break;

        default:
          throw new Error(`The API ${apiName} is not supported `);
      }
    };
  };

  _init();
})(window);
