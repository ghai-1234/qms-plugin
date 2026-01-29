/**
 * Main module for external plugins
 * @author Nachiket Kakatkar <nachiket@helpshift.com>
 * @created Oct 16, 2024
 * @module "ext-plugins/manager"
 */

import xhr from "utils/xhr";

const PLUGIN_PRODUCT_AREAS = {
  ISSUE_DETAILS: "issue_details"
};

/**
 * Events supported by the Helpshift plugins system
 */
const SUPPORTED_HOST_EVENTS = {
  LOGIN: "LOGIN",
  PLUGIN_HIDDEN: "plugin-hidden",
  PLUGIN_SHOWN: "plugin-shown"
};

let _plugins = {};

/**
 * Sends the given data as JSON string to the iframe of the
 * given pluginId
 * @param {string} pluginId - Plugin to which msg is to
 * be sent
 * @param {Objet} data - Data to be sent
 */
const _sendMessage = (pluginId, data) => {
  const {iframeEl, origin: pluginOrigin} = _plugins[pluginId];

  iframeEl.contentWindow.postMessage(JSON.stringify(data), pluginOrigin);
};

/**
 * Invokes the login API for plugin using HS auth
 * @param {string} pluginId - Plugin for which login is being invoked
 * @param {number} requestId - Unique identifier for the request
 */
const _login = (pluginId, requestId) => {
  xhr({
    route: "/xhr/plugins/auth/",
    method: "POST",
    data: {
      plugin_id: pluginId
    },
    onSuccess: (res) => {
      const {context} = _plugins[pluginId];

      _sendMessage(pluginId, {
        name: SUPPORTED_HOST_EVENTS.LOGIN,
        requestId,
        // @TODO: feature/ext-plugins: Check what else can be sent
        data: {
          token: res.token,
          agentEmail: HS.userEmail,
          agentName: HS.agentName,
          agentRole: HS.role,
          context
        }
      });
    },
    onFailure: () => {
      _sendMessage(pluginId, {
        name: SUPPORTED_HOST_EVENTS.LOGIN,
        requestId,
        data: {
          error: "Auth failed for plugin"
        }
      });
    }
  });
};

/**
 * Handle the payload received in the message from plugin iframe
 * @param {Object} payload - Payload received
 * @param {string} payload.eventType - Type of event
 * @param {Object} payload.data - Payload received from plugin
 * @param {string} pluginId - Plugin for which this payload was received
 */
const _handlePayload = (payload, pluginId) => {
  const {type: eventType, data: eventData} = payload;

  switch (eventType) {
    case SUPPORTED_HOST_EVENTS.LOGIN:
      _login(pluginId, eventData.requestId);
      break;

    default:
      // eslint-disable-next-line
      console.error(`Unsupported event type ${eventType} received from ${pluginId}`);
      break;
  }
};

/**
 * Processes plugin config from XHR response
 * @param {Object} rawConfig - Config object from the XHR response
 * @returns {Object} - Processed config object for a plugin
 */
const _processPluginConfig = (rawConfig) => {
  const {
    author,
    icon,
    id,
    name,
    publish_id: publishId,
    tooltip,
    product_area: type,
    url
  } = rawConfig;

  return {
    author,
    icon,
    id,
    name,
    publishId,
    tooltip,
    type,
    url
  };
};

/**
 * Sets the size and position for the iframe element using the refNode as the reference
 * @param {Element} iframeEl - Iframe of the plugin
 * @param {Object} dimensions - Dimensions to be set for the iframe plugin
 * @param {number} dimensions.top - Top to be set for the plugin iframe
 * @param {number} dimensions.left - Left to be set for the plugin iframe
 * @param {number} dimensions.width - Width to be set for the plugin iframe
 * @param {number} dimensions.height - Height to be set for the plugin iframe
 */
const _setIframeSizeAndPosition = (iframeEl, dimensions) => {
  const {left, top, width, height} = dimensions;

  iframeEl.height = `${height}px`;
  iframeEl.width = `${width - 8}px`;
  iframeEl.style.top = `${top + 4}px`;
  iframeEl.style.left = `${left + 4}px`;
};

export default {
  /**
   * Initialises the plugin system. Will fetch the config from the backend.
   */
  init() {
    xhr({
      route: "/xhr/plugins/config/",
      onSuccess: (res) => {
        _plugins = res.reduce((accumulator, rawPlugin) => {
          const plugin = _processPluginConfig(rawPlugin);
          const {id} = plugin;
          accumulator[id] = plugin;

          return accumulator;
        }, {});
      },
      onFailure: () => {
        // eslint-disable-next-line
        console.error("Failed to fetch config");
      }
    });
  },

  /**
   * Returns available plugins for a given product area
   * @param {string} productArea - A product area to get the plugins for
   * @returns {Object[]} - Array of plugin objects for the given product area
   */
  getPluginsByProductArea(productArea) {
    return Object.keys(_plugins)
      .filter((pluginId) => _plugins[pluginId].type === productArea)
      .map((pluginId) => _plugins[pluginId]);
  },

  /**
   * Loads the plugin iframe with the given id
   * @param {string} pluginId - Id of the plugin
   * @param {Object} context - The context in which this plugin is opened. The data
   * will vary with the product area.
   * @param {Object} dimensions - Dimensions to be set for the iframe plugin
   * @param {number} dimensions.top - Top to be set for the plugin iframe
   * @param {number} dimensions.left - Left to be set for the plugin iframe
   * @param {number} dimensions.width - Width to be set for the plugin iframe
   * @param {number} dimensions.height - Height to be set for the plugin iframe
   */
  loadPlugin(pluginId, context = {}, dimensions) {
    const pluginConfig = _plugins[pluginId];

    if (!pluginConfig) {
      return;
    }

    let {iframeEl} = pluginConfig;

    if (!iframeEl) {
      const {url} = pluginConfig;
      const iframeToAppend = document.createElement("IFRAME");
      const urlWithOriginQueryParam = `${url}?orig=${HS.cname}`;
      iframeToAppend.src = urlWithOriginQueryParam;
      iframeToAppend.id = pluginId;

      iframeToAppend.style.position = "fixed";
      iframeToAppend.style.zIndex = "999";

      document.body.append(iframeToAppend);
      _plugins[pluginId].iframeEl = iframeToAppend;

      const pluginOrigin = new URL(url).origin;
      _plugins[pluginId].origin = pluginOrigin;

      window.addEventListener(
        "message",
        (ev) => {
          if (ev.origin !== pluginOrigin) {
            return;
          }

          try {
            const data = JSON.parse(ev.data);

            _handlePayload(data, pluginId);
          } catch (e) {
            // eslint-disable-next-line
            console.error("Error while parsing data ", e);
          }
        },
        pluginOrigin
      );

      iframeEl = iframeToAppend;
    }

    // Send the event only if the plugin was not shown before and is shown now
    if (iframeEl.style.display !== "block") {
      iframeEl.style.display = "block";

      _plugins[pluginId].context = context;

      _sendMessage(pluginId, {
        name: SUPPORTED_HOST_EVENTS.PLUGIN_SHOWN,
        context
      });
    }

    _setIframeSizeAndPosition(iframeEl, dimensions);
  },

  /**
   * Hides the iframe of the given plugin
   * @param {string} pluginId - Plugin id
   */
  hidePlugin(pluginId) {
    const pluginConfig = _plugins[pluginId];

    if (!pluginConfig) {
      return;
    }

    const {iframeEl} = pluginConfig;

    if (iframeEl) {
      iframeEl.style.display = "none";
      _plugins[pluginId].context = {};

      _sendMessage(pluginId, {
        name: SUPPORTED_HOST_EVENTS.PLUGIN_HIDDEN
      });
    }
  },

  /**
   * Updates the plugin iframe with top, left, height and width
   * @param {string} pluginId - Id of the plugin
   * @param {Object} dimensions - Dimensions to be set for the iframe plugin
   * @param {number} dimensions.top - Top to be set for the plugin iframe
   * @param {number} dimensions.left - Left to be set for the plugin iframe
   * @param {number} dimensions.width - Width to be set for the plugin iframe
   * @param {number} dimensions.height - Height to be set for the plugin iframe
   */
  updatePluginIframeSizeAndPosition(pluginId, dimensions = {}) {
    const pluginConfig = _plugins[pluginId];

    if (!pluginConfig) {
      return;
    }

    const {iframeEl} = pluginConfig;

    if (!iframeEl) {
      return;
    }

    _setIframeSizeAndPosition(iframeEl, dimensions);
  },

  /**
   * Blocks events going to the iframe by setting pointer-events to "none"
   * @param {string} pluginId - Id of the plugin
   */
  stopPluginIframeEventListening(pluginId) {
    const pluginConfig = _plugins[pluginId];

    if (!pluginConfig) {
      return;
    }

    const {iframeEl} = pluginConfig;

    if (!iframeEl) {
      return;
    }

    iframeEl.style.pointerEvents = "none";
  },

  /**
   * Unblocks events going to the iframe by setting pointer-events to empty string
   * @param {string} pluginId - Id of the plugin
   */
  startPluginIframeEventListening(pluginId) {
    const pluginConfig = _plugins[pluginId];

    if (!pluginConfig) {
      return;
    }

    const {iframeEl} = pluginConfig;

    if (!iframeEl) {
      return;
    }

    iframeEl.style.pointerEvents = "";
  },

  PLUGIN_PRODUCT_AREAS
};
