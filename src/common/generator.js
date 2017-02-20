window.POGLoaded = !!window.POG;
var log;
window.POG=(function() {
    // to compartment any js error on the page
    var ELEMENT_NODE = 1;
    var NG_PREFIXES = ['ng-','data-ng-','ng_','x-ng-','ng\\:'];
    var NG_STRATEGIES = [ { handler: getNgModelName, strategy: 'model' } ];
    var SHOW_COMMENT = 128;

    // ========================================================================
    // private functions

    function getAttributeSelector(name, node) {
        var response = '';
        var value = node.getAttribute(name);

        if (value) {
            var selector = node.nodeName.toLowerCase();
            if (name === 'class') {
                selector += '.' + value.split(/\s+/g).join('.');
            }
            else {
                selector += '[' + name + '=\'' + value + '\']';
            }
            if (document.querySelectorAll(selector).length === 1) {
                response = selector;
            }
        }

        return response;
    }

    function getClosestSibling(node, siblings) {
        var copies = [].slice.call(siblings);
        copies.unshift(node);
        var copiesLength = copies.length;
        var closest = 1;

        if (closest > copiesLength) {
            closest = 0;
        }

        var nodeIndex = 0;
        var siblingIndex = closest;

        for (var i = 0; i < copiesLength; i++) {
            var delta = Math.abs(nodeIndex - i);

            if (delta > closest) {
                closest = delta;
                siblingIndex = i;
            }
        }

        return (siblingIndex === 0) ? null : copies[siblingIndex];
    }

    function getComments(root) {
        var comments = [];
        var index = -1;
        var walker = document.createTreeWalker(root, SHOW_COMMENT, null, false);

        while (walker.nextNode()) {
            comments[++index] = walker.currentNode;
        }

        return comments;
    }

    function getCSSSelector(node) {
        var selector = '';

        for (; node && node.nodeType === ELEMENT_NODE; node = node.parentNode) {

            if (node && node.id) {
                selector = '#' + node.id + ' ' + selector;
                break;
            }
            else {
                var nodeName = node.nodeName;
                var currentSelector = nodeName.toLowerCase();
                var index = getNodeIndex(node, nodeName);

                if (index > 0) {
                    // it has siblings
                    currentSelector += ':nth-of-type(' + index + ')';
                }
                else {
                    if (node.className !== '') {
                        currentSelector += '.' + node.className.split(/\s+/g).join('.');
                    }

                    if (nodeName === 'INPUT') {
                        if (node.getAttribute('type')) {
                            currentSelector += '[type=\'' + node.type + '\']';
                        }
                        else if (node.getAttribute('data-type')) {
                            currentSelector += '[data-type=\'' +
                                node.getAttribute('data-type') + '\']';
                        }
                    }
                }

                selector = currentSelector + ' ' + selector;
            }
        }

        return selector.replace(/^html[^\b]*\bbody\b/, '').trim();
    }

    function getDefinition(input) {
        input = input || {};
        var actionLowered = input.action.toLowerCase();
        var buffer = Object.extend(input.buffer);
        // deep copy
        //jcardona taking of redundancy, maybe not.
        //buffer.attribute = Object.extend(buffer.attribute);
        //buffer.operation = Object.extend(buffer.operation);

        var idName = buffer.attribute.value;
        var suffixes = {
            action: (actionLowered === 'click') ? ' on' : '',
            label: (actionLowered === 'set') ? ' Field' : ''
        };
        suffixes.documentation = ' ' + getLetter(input.fullText || input.text, LETTERS.NATURAL) +
            ' ' + (input.label + suffixes.label.toLowerCase()) + '.';
        suffixes.name = ' ' + input.text + ' ' + input.label + suffixes.label;

        if (input.negate) {
            input.action = 'Un' + actionLowered;
            buffer.negate = 1;
        }

        if (input.hasArgument) {
            suffixes.action = (input.negate) ? ' value from' : ' value to';
            buffer.argument = {};
            buffer.argument.documentation = input.action + ' default' +
                suffixes.action + suffixes.documentation;
            buffer.argument.key = getLetter(input.text, LETTERS.UPPER);
            buffer.argument.name = getLetter(input.text + ' value',
                input.letters.attribute);
        }

        //buffer.attribute.name = getLetter(input.text, input.letters.attribute);
        buffer.attribute.name = getLetter(idName, input.letters.attribute);

        buffer.operation.documentation = input.action + suffixes.action +
            suffixes.documentation;
        buffer.operation.name = getLetter(input.action + suffixes.name,
            input.letters.operation, input.action);

        return buffer;
    }

    function getFileName(path) {
        return path.substring(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
    }

    function getHiddens(cloned, original) {
        var clones = cloned.getElementsByTagName('*');
        var originals = original.getElementsByTagName('*');
        var hiddens = (cloned) ? Array.filter(cloned.querySelectorAll(
            '*:not(br):not(img):not(input):not(link):not(option):not(script):not(select):not(style)'
        ), function(item, index) {
            var sourceIndex = [].indexOf.call(clones, item);
            return originals[sourceIndex].offsetHeight < 1 || !isElementInViewport(item);
        }) : [];
        return hiddens;
    }

    function getLabelText(node) {
        var text = '';

        if (node && node.id) {
            text = getLabelTextFor(node, 'id');
        }

        if (text === '' && node && node.name) {
            // non-standard, but it happens
            text = getLabelTextFor(node, 'name');
        }

        if (text === '') {
            // find label from siblings
            // TODO: should use more aggressive collector
            var labels = (node && node.parentNode) ?
                node.parentNode.querySelectorAll('label') : [];
            var label = getClosestSibling(node, labels);

            if (label) {
                text = label.textContent || label.innerText || '';
                text = text.trim();
            }
        }

        return text;
    }

    function getLabelTextFor(node, attribute) {
        var identifier = node.getAttribute(attribute) || node[attribute] || '';
        var text = '';

        if (identifier) {
            var label = document.querySelector('label[for="' + identifier + '"]');

            if (label) {
                text = label.textContent || label.innerText || '';
                text = text.trim();
            }

            if (text === '') {
                var identifierLowered = identifier.toLowerCase();
                var labels = Array.filter(document.querySelectorAll('label[for]'), function(item) {
                    return item.getAttribute('for').toLowerCase() === identifierLowered;
                });

                label = getClosestSibling(node, labels);

                if (label) {
                    text = label.textContent || label.innerText || '';
                    text = text.trim();
                }
            }
        }

        return text;
    }

    function getLetter(value, type, action) {
        action = action || '';
        type = type || LETTERS.CAMEL;
        type = parseInt(type);
        value = value || '';

        if (type !== LETTERS.NATURAL) {
            // move number prefix to the end of the value
            var oldValue = value.replace(action, '').trim();
            var numberPrefix = /^([\d.]+)/.exec(oldValue);
            if (numberPrefix) {
                value = value.replace(numberPrefix[0], '') + ' ' + numberPrefix[0];
            }
        }

        switch (type) {
            case LETTERS.LOWER:
            case LETTERS.UPPER:
                value = value.replace(/\./g, '_').replace(/\s+|__/g, '_').replace(/^_|_$/g, '');
                value = (type === LETTERS.LOWER) ? value.toLowerCase() : value.toUpperCase();
                break;
            case LETTERS.CAMEL:
            case LETTERS.PROPER:
                value = value.replace(/\./g, ' ').trim().replace(/\s\s+/g, ' ').
                    replace(/\w\S*/g, function(word) {
                        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
                    }).replace(/\s+/g, '');
                if (type === LETTERS.CAMEL) {
                    value = value.charAt(0).toLowerCase() + value.substr(1);
                }
                break;
            case LETTERS.NATURAL:
                value = value.trim().replace(/\s\s+/g, ' ').replace(/\w\S*/g, function(word) {
                        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
                    });
                break;
        }

        return value;
    }

    function getLinkText(node) {
        var image = node.querySelector('img');
        var text = '';

        if (image) {
            text = image.alt || getFileName(image.src);
        }

        return text.trim();
    }

    /**
     * getLocator returns an object with the strategy and value fo said strategy
     * to locate an element given. Can be added angular strategies.
     * */
    function getLocator(node, angular) {
        var response = {};

        if (angular) {
            response = getNgLocator(node);
        }

        if (!response.strategy) {
            if (node.id) {
                response.strategy = 'id';
                response.value = node.id;
            }
            /**
             *  //jcardona
             *  //this portion of the code was taken of to handdle only elements with ID
            else if (node.name) {
                response.strategy = 'name';
                response.value = node.name;
            }
            else {
                response.strategy = 'css';

                if (node.getAttribute('class')) {
                    response.value = getAttributeSelector('class', node);
                }

                if (!response.value && node.title) {
                    response.value = getAttributeSelector('title', node);
                }

                if (!response.value && node.getAttribute('href')) {
                    response.value = getAttributeSelector('href', node);
                }

                if (!response.value) {
                    response.value = getCSSSelector(node);
                }
            }
             */
        }

        return response;
    }

    function getLongestName(name, longest) {
        name = name || '';
        var length = name.length;

        if (length > longest) {
            longest = length;
        }

        return longest;
    }

    function getNgLocator(node) {
        var response = {};

        for (var i = 0, j = NG_STRATEGIES.length; i < j; i++) {
            var item = NG_STRATEGIES[i];
            var value = item.handler(node);

            if (value) {
                response.strategy = item.strategy;
                response.value = value;
            }
        }

        return response;
    }

    function getNgModelName(node) {
        var name = '';

        for (var i = 0, j = NG_PREFIXES.length; i < j; i++) {
            name = node.getAttribute(NG_PREFIXES[i] + 'model') || '';

            if (name) {
                break;
            }
        }

        return name.trim();
    }

    function getNodeIndex(node, nodeName) {
        nodeName = nodeName || node.nodeName;

        var siblings = (node && node.parentNode) ?
            Array.filter(node.parentNode.children, function(item, index) {
                return item.nodeName === nodeName;
            }) : [];

        var index = [].indexOf.call(siblings, node);
        // convert to 1-based index
        index++;

        return (index === 1 && index === siblings.length) ? 0 : index;
    }

    function getNodeText(node) {
        var text = getLabelText(node);

        if (text === '') {
            var parentNode = (node) ? node.parentNode : null;

            if (parentNode) {
                var clonedParentNode = parentNode.cloneNode(true);
                var clonedNode = clonedParentNode.querySelector(
                    node.nodeName.toLowerCase());
                clonedNode.parentNode.removeChild(clonedNode);
                clonedParentNode = sanitizeNode(clonedParentNode, parentNode);

                text = clonedParentNode.textContent || clonedParentNode.innerText || '';
                text = getSentences(text.trim())[0] || '';
            }
        }

        if (text === '') {
            text = (node) ? getNodeText(node.parentNode) : '';
        }

        return text;
    }

    function getPageVisibleHTML(original) {
        original = original || document.body;
        var cloned = original.cloneNode(true);
        cloned = sanitizeNode(cloned, original);
        return cloned.outerHTML;
    }

    function getSanitizedText(text, max) {
        var texts = (text || '').split(/\s+/g);

        if (max) {
            texts = texts.slice(0, max);
        }

        return texts.join(' ').trim().replace(/[^a-zA-Z0-9\. ]/g, '');
    }

    function getSentences(text, minimumWords) {
        minimumWords = minimumWords || 5;
        var index = -1;
        var response = [];
        var sentences = text.match(/[^\r\n.!?]+/gi) || [];

        for (var i = 0, j = sentences.length; i < j; i++) {
            var sentence = sentences[i].trim();

            if (sentence !== '') {
                var words = (sentence.match(/\b\w+\b/gi) || []).length;
                if (words >= minimumWords) {
                    // faster array push
                    response[++index] = sentence;
                }
            }
        }

        return response;
    }

    function getSentenceFrequency(sentences, words) {
        if ({}.toString.call(sentences) !== '[object Array]') {
            return [];
        }

        var items = (words.tops.length) ? words.tops : words;
        sentences = sentences.slice(0);
        sentences.frequencies = {};

        for (var i = 0, j = sentences.length; i < j; i++) {
            var sentence = sentences[i];
            var sentenceLowered = sentence.toLowerCase();
            sentences.frequencies[sentence] = 0;

            for (var k = 0, l = items.length; k < l; k++) {
                if (sentenceLowered.indexOf(items[k]) > -1) {
                    sentences.frequencies[sentence]++;
                }
            }
        }

        // desc
        sentences.sort(function(a, b) {
            return sentences.frequencies[b] - sentences.frequencies[a];
        });

        return sentences;
    }

    function getWordFrequency(text) {
        var index = -1;
        var topIndex = -1;
        var words = [];
        words.frequencies = {};
        words.tops = [];

        text.toLowerCase().split(/[\s*\.*\,\;\+?\#\|:\-\/\\\[\]\(\)\{\}$%&0-9*]/).
            map(function(k, v) {
                if (k && k.length > 1) {
                    words.frequencies[k]++ || (words.frequencies[k] = 1);
                }
            });

        for (var word in words.frequencies) {
            words[++index] = word;

            if (words.frequencies[word] > 1) {
                words.tops[++topIndex] = word;
            }
        }

        // desc
        words.sort(function(a, b) { return words.frequencies[b] - words.frequencies[a]; });
        words.tops.sort(function(a, b) { return words.frequencies[b] - words.frequencies[a]; });

        return words;
    }

    function isElementInViewport(el) {
        if (typeof(jQuery) !== 'undefined' && el instanceof jQuery) {
            el = el[0];
        }

        var rect = el.getBoundingClientRect();
        var windowHeight = (window.innerHeight || document.documentElement.clientHeight);
        var windowWidth = (window.innerWidth || document.documentElement.clientWidth);

        return ((rect.left > -1) && (rect.top > -1) &&
            ((rect.left + rect.width) <= windowWidth) &&
            ((rect.top + rect.height) <= windowHeight));
    }

    function removeNodes(nodes) {
        var type = {}.toString.call(nodes);

        if (type !== '[object Array]' &&
                !(type === '[object NodeList]' || type === '[object Object]')) {
            return;
        }

        var index = -1;
        var length = nodes.length;

        while(++index < length) {
            var node = nodes[index];
            if (node) {
                (node.parentNode || { removeChild: function() {} }).removeChild(node);
            }
        }
    }

    function sanitizeNode(clonedNode, originalNode) {
        var comments = getComments(clonedNode);
        var excludes = (clonedNode) ?
            clonedNode.querySelectorAll('img,input,link,option,script,select,style') : [];
        var hiddens = getHiddens(clonedNode, originalNode);
        removeNodes(comments);
        removeNodes(excludes);
        var excludedNode = clonedNode.cloneNode(true);
        removeNodes(hiddens);
        // ng:view template doesn't have height,
        // hence it will considered as hidden
        if (clonedNode.textContent.trim() === '') {
            clonedNode = excludedNode;
        }
        return clonedNode;
    }

    function setDefinitions(input) {
        var definitions = [];
        var root = document.querySelector(input.nodes.root) || document; // gets the element root from which is going to be selected the rest of the nodes
        //var nodes = (root) ? root.querySelectorAll(input.nodes.selector) : []; // gets all the nodes from root according to desired tags within input.nodes.selector
        var nodes = (root) ? root.querySelectorAll("[id]") : []; // gets all the nodes from root according to desired tags within input.nodes.selector
        var type = {}.toString.call(nodes);
        if (!(type === '[object NodeList]' || type === '[object Object]')) { //validates all went as expected :)
            input.definitions = definitions;
            return input;
        }

        var firsts = {};
        var hasField = false;
        var index = -1;
        var longestName = 0;
        var submit = { label: '', text: '' };
        var tags = document.getElementsByTagName('*');
        var texts = {};
        var unsets = {};
        var visibleOnly = (parseInt(input.nodes.visibility) === VISIBILITIES.VISIBLE);

        for (var i = 0, j = nodes.length; i < j; i++) {
            var buffer = { attribute: {}, operation: {} };
            var definition = {};
            var node = nodes[i];

            if ((visibleOnly && node.offsetHeight > 0) || !visibleOnly) {
                var action = '';
                var hasArgument = false;
                var hasUnset = false;
                var label = '';
                var locator = getLocator(node, input.nodes.angular);
                var text = node.textContent || node.innerText || '';

                // this following 'spaghetti' validation checks for locator to NOT be null, so that only elements with ID are proccesed. //jcardona
                if(!(Object.keys(locator).length === 0 && locator.constructor === Object)) {
                    buffer.attribute.strategy = locator.strategy;
                    buffer.attribute.value = locator.value;
                    buffer.sourceIndex = node.sourceIndex || [].indexOf.call(tags, node);
                    buffer.attribute.idforgroovy = getProperId(locator.value);

                    /** //jcardona. Adds operations according to the type of element that it is.
                     */

                }
            }

            definition = getDefinition({
                action: action,
                buffer: buffer,
                hasArgument: hasArgument,
                label: label,
                letters: {
                    attribute: input.attributes.letter,
                    operation: input.operations.letter
                }
            });
            definitions[++index] = definition;

        }


        input.definitions = definitions;
        return input;
    }

    function getProperId(value){
        console.log("value before: '" + value + "'");
        var str = value.charAt(0).toLowerCase() + value.substr(1);
        str = str.replace(/-/g,'$');
        console.log("value before: '" + str + "'");
        return str;
    }

    //** =====================================================================
    // Debug area
    // */

    // ========================================================================
    // POG namespace

    return {
        generate: function(input) {
            input = input || {};
            var output = Object.extend(input);
            output = common.setDefaultValues(output);
            output = setDefinitions(output);
            output.url = document.location.href;

            return {out: output, logz:log};
        },
        LETTERS: LETTERS,
        VISIBILITIES: VISIBILITIES
    };
})();

if (!window.POGLoaded) {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (!sender.tab && request.input) {
            sendResponse(POG.generate(request.input));
        }
    });
}
