      /**
                    * parseUri 1.2.2
                    * Tests are at [http://stevenlevithan.com/demo/parseuri/js/]
                    *
                    * @param {String} str URI to parse.
                    * @returns Object containing the following keys:
                           "source","protocol","authority","userInfo","user",
                           "password","host","port","relative","path","directory",
                           "file","query","anchor"]
                    */
      parseUri = function(str) {
        var options = {
          strictMode: false,
          key: [
            "source", "protocol", "authority", "userInfo", "user",
            "password", "host", "port", "relative", "path", "directory",
            "file", "query", "anchor"
          ],
          q: {
            name: "queryKey",
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
          },
          parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
          }
        };

        var o = options,
          m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
          uri = {},
          i = 14;

        while (i--) {
          uri[o.key[i]] = m[i] || "";
        }

        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function($0, $1, $2) {
          if ($1) {
            uri[o.q.name][$1] = $2;
          }
        });

        return uri;
      }

      /**
       * @param {Object} obj {
       *     path: '/something',
       *     anchor: 'hash',
       *     query: '?asdf=foo',
       *     queryKey: {
       *        asdf: 'foo'
       *     },
       *     relative: '',
       *     source: ''
       * }
       *
       * @return String /something?asdf=foo#hash
       */
      stringifyUriPath = function(obj) {
        var uri = obj.path;

        var keys = Object.keys(obj.queryKey);

        if (keys.length > 0) {
          var params = [];
          uri += '?';
          keys.forEach((key) => {
            if (obj.queryKey[key]) {
              params.push(key + '=' + obj.queryKey[key]);
            }
          });
          uri += params.join('&');
        }

        if (obj.anchor) {
          uri += '#' + obj.anchor;
        }

        return uri;
      }

      getAttributeContents = function(attributes, value, attribute, content) {
        for (var i = 0; i < attributes.length; i++) {
          if (attributes[i].getAttribute("property") === value ||
            attributes[i].getAttribute("name") === value ||
            attributes[i].getAttribute(attribute) === value) {
            return attributes[i].getAttribute(content || "content");
          }
        }
      }

      /**
       * Takes any url string and returns a relative path.
       *
       * If the original url was FQ, strips out the domain portion and hash portions
       *     http://cbc.ca/url?query#hash -> /url
       *     path -> /path
       *     /root#hash -> /root
       *
       * this function is repeatable, parsePath(parsePath(/url)) -> /url
       *
       * @param {String} href
       *
       * @return {String} relative URI or undefined if href was falsy
       */
      parsePath = function(href) {

        var url;

        href = decodeURIComponent(href);
        url = href.match(/^([a-z]+):\/\/\/?([^\/]+)(\/[^#]*)?/i);

        if (url && url.length == 4) {
          return url[3] || '/';
        }

        url = (href[0] === '/' ? href : '/' + href).match(/^([^#]+)/);

        return url[1];
      }

      fetchPath = function(meta) {
        var path;
        var url = parsePath(location.href);

        var ogUrl = getAttributeContents(meta, "og:url"),
          ogPath;

        if (ogUrl) {
          // strip out domain and hash
          ogPath = ogUrl.match(/^([a-z]+):\/\/([^\/]+)([^#]+)/i);

          if (ogPath && ogPath.length >= 4) {
            ogPath = ogPath[3];
          } else {
            Debug.warn("og:url is invalid (" + ogUrl + ")");
            ogPath = null;
          }
        }

        path = url || location.pathname;

        var uri = parseUri(path);

        if (uri.queryKey && uri.queryKey.__vfz) {
          delete uri.queryKey.__vfz;
        }

        path = decodeURIComponent(stringifyUriPath(uri)) || '/';

        return path;
      }

      fetchTitle = function(meta) {
        return (getAttributeContents(meta, "vf:title") ||
          getAttributeContents(meta, "og:title") ||
          getAttributeContents(meta, "twitter:title") ||
          (document.getElementsByTagName("title")[0] && document.getElementsByTagName("title")[0].innerHTML)
          || location.href).substring(0, 500); // Discuss whether we want the title to be url by default
      }

      fetchImage = function(meta) {
        return getAttributeContents(meta, "vf:image") ||
          getAttributeContents(meta, "og:image") ||
          getAttributeContents(meta, "twitter:image") ||
          getAttributeContents(document.getElementsByTagName("link"), "rel", "image_src") ||
          /*$("link").filter("[rel=image_src]").attr("href") || */
          "";
      }

      fetchDescription = function(meta) {
        // ["vf:description", "og:description", "description", "twitter:description"].map((attr)=>{getAttributeContents(meta, attr)}).concat("").reduce((a,b) => {a || b})
        return (getAttributeContents(meta, "vf:description") ||
          getAttributeContents(meta, "og:description") ||
          getAttributeContents(meta, "description") ||
          getAttributeContents(meta, "twitter:description") || "").substring(0, 500);
      }

      export function locations() {
        var meta = document.getElementsByTagName("meta");
        var url = parseUri(location.href);
        var response = [];
        response.push(["domain", url.host || location.hostname || ""]);
        response.push(["path", fetchPath(meta) || ""]);
        response.push(["title", fetchTitle(meta) || ""]);
        response.push(["image", fetchImage(meta) || ""]);
        response.push(["description", fetchDescription(meta) || ""]);
        response.push(["unique_id", getAttributeContents(meta, "vf:unique_id") || ""]);
        response.push(["lang", getAttributeContents(meta, "vf:lang") || ""]);
        response.push(["section", getAttributeContents(meta, "vf:section") || ""]);
        return response;
      }
