var MNI = MNI || {};

(function (document, window, MNI) {

    var NULL = null,
        prefix = 'mn-widget-member',
        widgets = MNI.Widgets || (MNI.Widgets = {}),
        callbacks = MNI.Callbacks || (MNI.Callbacks = {});

    function extend(target, source) {
        var name, value;
        
        target = target || {};

        for(name in source) {
            if ((value = source[name]) !== undefined)
                target[name] = value;
        }

        return target;
    };

    function addClass(element, className) {
        element.className += ' ' + className;
    };

    function removeClass(element, className) {
        element.className = element.className.replace(new RegExp('(?:^|\\s)' + className + '(?!\\S)'), '');
    };

    /*
    * @param {string} type
    * @param {Object=} attributes
    * @param {string=} className
    */
    function createElement(type, attributes, className) {
        var element = document.createElement(type);
        for (var name in attributes)
            element.setAttribute(name, attributes[name]);
        if (className)
            addClass(element, className);
        return element;
    };

    function createDivElement(className) {
        return createElement('div', NULL, className);
    };

    function getScriptDomain() {
        var scripts = document.getElementsByTagName('script');

        for(var i = 0; i < scripts.length; i++)
        {
            var script = scripts[i],
                match = script.src.match(/\/\/([^/]+)\/(public\/)?content\/script\/member(\.min)?\.js/i);
                
            if (match)
                return match[1];
        }
    };

    function AjaxRequest(url, data, callback) {
        function scriptOnLoad() {
            if (!this.readyState || this.readyState == 'loaded' || this.readyState == 'complete') {
                this.onload = this.onreadystatechange = NULL;
                this.parentNode.removeChild(this);
            }
        };

        var firstScript = document.getElementsByTagName('script')[0],
            script = createElement('script', NULL, NULL),
            callbackName = 'Ajax' + +new Date,
            queryString = [],
            name,
            value;

        data = extend({
            jsonpcallback: 'MNI.Callbacks.' + callbackName
        }, data);

        for(name in data)
        {
            if ((value = data[name]) != undefined)
                queryString.push(window.encodeURIComponent(name) + '=' + window.encodeURIComponent(value));
        }

        callbacks[callbackName] = function(data) {
            scriptOnLoad.call(script);
            callback(data);
        };

        if (queryString.length)
            url += (url.indexOf('?') >= 0 ? '&' : '?') + queryString.join('&');

        script.async = true;
        script.onload = script.onreadystatechange = scriptOnLoad;
        script.src = url;
        firstScript.parentNode.insertBefore(script, firstScript);
    };

    function Member(element, opts) {
        if (typeof element === 'string')
            element = document.getElementById(element);

        opts = extend({}, opts);

        this._element = element;
        this._secure = opts.secure;
        this._domain = opts.domain || getScriptDomain();
        this._path = opts.path;
        this._protocol = opts.protocol;
        this._member = opts.member;
        this._styleTemplate = opts.styleTemplate;
    };

    extend(Member.prototype, {
        _getSecure: function() {
            if (this._secure !== undefined)
                return this._secure;

            return window.location.protocol == 'https:' ?
                true :
                undefined;
        },
        _getURL: function () {
            return this._getSecure() ?
                'https://' + this._domain + '/public/widgets/member' :
                'http://' + this._domain + '/widgets/member';
        },
        'create': function() {
            var self = this,
                ajaxUrl = self._getURL(),
                hostname = window.location.hostname,
                parameters = {
                    secure: self._getSecure(),
                    referrer: hostname || null,
                    memId: self._member
                },
                styleTemplate = self._styleTemplate;

            if (styleTemplate) {
                var containerId = self._element.getAttribute('id');

                if (!containerId) {
                    containerId = 'mni-member-' + +new Date;
                    self._element.setAttribute('id', containerId);
                }

                var headElement = document.getElementsByTagName('head')[0],
                    styleElement,
                    tokens = /@\w+/g,
                    patterns = {
                        id: containerId
                    },
                    css = styleTemplate.replace(tokens, function (segment) {
                        return patterns[segment.slice(1)] || segment;
                    });

                if (document.createStyleSheet) {
                    styleElement = document.createStyleSheet();
                    styleElement.cssText = css;
                } else {
                    styleElement = createElement('style', { id: containerId + '-style' }, NULL);
                    styleElement.appendChild(document.createTextNode(css));

                    if (headElement)
                        headElement.appendChild(styleElement);
                }
            }

            new AjaxRequest(ajaxUrl, parameters, function (data) {
                if ('Error' in data)
                    return;

                var widget = createDivElement(prefix),
                    name = createDivElement(prefix + '-name'),
                    text = createDivElement(prefix + '-text'),
                    assoc = createDivElement(prefix + '-assoc'),
                    image,
                    link;

                if (data.URL)
                    assoc.appendChild(link = createElement('a', { href: data.URL, target: '_blank' }, prefix + '-link'));

                name.appendChild(document.createTextNode(data.Member));
                text.appendChild(document.createTextNode('Proud Member of'));
                (link || assoc).appendChild(data.Logo ?
                    createElement('img', { src: data.Logo, alt: data.Customer, title: data.Customer }, prefix + '-logo') :
                    document.createTextNode(data.Customer));

                widget.appendChild(name);
                widget.appendChild(text);
                widget.appendChild(assoc);

                self._element.appendChild(widget);
            });

            return this;
        }
    });

    widgets['Member'] = Member;

})(document, window, MNI);
