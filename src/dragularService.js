/* global angular */
'use strict';

/**
 * dragular Module and Service by Luckylooke https://github.com/luckylooke/dragular
 * Angular version of dragula https://github.com/bevacqua/dragula
 */

var dragularModule = require('./dragularModule');

/**
 * @ngInject
 */

dragularModule.factory('dragularService', ['$rootScope', function dragula($rootScope) {

  var shared = { // function returned as service
      classesCache: {}, // classes lookup cache
      containersModel: {}, // containers model
      containers: {}, // containers managed by the drake
      mirror: null, // mirror image
      source: null, // source container
      item: null, // item being dragged
      sourceItem: null, // item originaly dragged if copy is enabled
      sourceModel: null, // source container model
      lastDropTarget: null, // last container item was over
      offsetX: null, // reference x
      offsetY: null, // reference y
      offsetXr: null, // reference x right for boundingBox feature
      offsetYb: null, // reference y bottom for boundingBox feature
      clientX: null, // cache client x, init at grab, update at drag
      clientY: null, // cache client y, init at grab, update at drag
      mirrorWidth: null, // mirror width for boundingBox feature
      mirrorHeight: null, // mirror height for boundingBox feature
      initialSibling: null, // reference sibling when grabbed
      currentSibling: null, // reference sibling now
      initialIndex: null, // reference model index when grabbed
      currentIndex: null, // reference model index now
      isContainerModel: null, // if o.isContainer is used, model can be provided as well, here it is kept
      targetContainer: null, // droppable container under drag item
      dragOverEvents: {}, // drag over events fired on element behind cursor
      lastElementBehindCursor: null, // last element behind cursor
      grabbed: null // holds mousedown context until first mousemove
    },
    serviceFn = function(initialContainers, options) {

      if (arguments.length === 1 && !Array.isArray(initialContainers) && !angular.isElement(initialContainers) && !initialContainers[0]) {
        // then containers are not provided, only options
        options = initialContainers;
        initialContainers = [];
      }

      var body = document.body,
        documentElement = document.documentElement,
        defaultClasses = {
          mirror: 'gu-mirror',
          hide: 'gu-hide',
          unselectable: 'gu-unselectable',
          transit: 'gu-transit'
        },
        isContainer, // internal isContainer
        o = { // options
          dragOverEventNames: ['dragularenter', 'dragularleave', 'dragularrelease'],
          classes: defaultClasses,
          containers: false,
          moves: always,
          accepts: always,
          isContainer: never,
          copy: false,
          invalid: invalidTarget,
          revertOnSpill: false,
          removeOnSpill: false,
          lockX: false,
          lockY: false,
          boundingBox: false,
          containersModel: false,
          isContainerModel: emptyObj
        };

      if (!isElement(o.boundingBox)) {
        o.boundingBox = null;
      }

      if (options && options.classes) {
        angular.extend(defaultClasses, options.classes);
        angular.extend(options.classes, defaultClasses);
      }

      angular.extend(o, options);

      if (!o.mirrorContainer) {
        o.mirrorContainer = document.body;
      }

      // get initial containers from options, argument or fall back to empty array (containers can be also added later)
      initialContainers = o.containers || initialContainers || [];
      initialContainers = makeArray(initialContainers);

      if (o.containersModel) {
        //                            is 2D array?
        o.containersModel = Array.isArray(o.containersModel[0]) ? o.containersModel : [o.containersModel];
      }

      function proceedContainers(containers, nameSpace, initial) {
        if (!containers[nameSpace]) {
          containers[nameSpace] = [];
        }
        Array.prototype.push.apply(containers[nameSpace], initial);
      }

      // feed containers groups and optionaly shadow it by models
      if (!o.nameSpace) {
        o.nameSpace = ['dragularCommon'];
      }
      if (!Array.isArray(o.nameSpace)) {
        o.nameSpace = [o.nameSpace];
      }
      o.nameSpace.forEach(function eachNameSpace(nameSpace) {
        proceedContainers(shared.containers, nameSpace, initialContainers);
        if (o.containersModel) {
          proceedContainers(shared.containersModel, nameSpace, o.containersModel);
        }
      });

      //register events
      events();

      angular.forEach(o.dragOverEventNames, function prepareDragOverEvents(dragOverEvent) {
        if (document.createEvent) {
          shared.dragOverEvents[dragOverEvent] = document.createEvent('HTMLEvents');
          shared.dragOverEvents[dragOverEvent].initEvent(dragOverEvent, true, true);
        } else {
          shared.dragOverEvents[dragOverEvent] = document.createEventObject();
          shared.dragOverEvents[dragOverEvent].eventType = dragOverEvent;
        }
      });

      isContainer = function isContainer(el) {
        var i = o.nameSpace.length;
        while (i--) {
          if (shared.containers[o.nameSpace[i]].indexOf(el) !== -1) {
            return true;
          }
        }
        if (o.isContainer(el)) {
          shared.isContainerModel = o.isContainerModel(el);
          return true;
        } else {
          shared.isContainerModel = null;
        }
        return false;
      };

      var drake = {
        containers: shared.containers,
        containersModel: shared.containersModel,
        isContainer: isContainer,
        start: manualStart,
        end: end,
        cancel: cancel,
        remove: remove,
        destroy: destroy,
        dragging: false
      };

      return drake;

      // make array from array-like objects or from single element (based on bevacqua/atoa)
      function makeArray(all, startIndex) {
        if (Array.isArray(all)) {
          return all;
        }
        if (all.length) { // is array-like
          return Array.prototype.slice.call(all, startIndex);
        } else { // is one element
          return [all];
        }
      }

      // add or remove containers - deprecated
      function removeContainers(all) {
        $rootScope.applyAsync(function applyDestroyed() {
          var changes = Array.isArray(all) ? all : makeArray(all);
          changes.forEach(function forEachContainer(container) {
            angular.forEach(o.nameSpace, function forEachNs(nameSpace) {
              var index;
              index = shared.containers[nameSpace].indexOf(container);
              shared.containers[nameSpace].splice(index, 1);
              if (o.containersModel) {
                shared.containersModel[nameSpace].splice(index, 1);
              }
            });
          });
        });
      }

      function events(remove) {
        var op = remove ? 'off' : 'on';
        regEvent(documentElement, op, 'mouseup', release);

        initialContainers.forEach(function addMouseDown(container) {
          regEvent(container, 'on', 'mousedown', grab);
        });
      }

      function eventualMovements(remove) {
        var op = remove ? 'off' : 'on';
        regEvent(documentElement, op, 'mousemove', startBecauseMouseMoved);
      }

      function movements(remove) {
        var op = remove ? 'off' : 'on';
        regEvent(documentElement, op, 'selectstart', preventGrabbed); // IE8
        regEvent(documentElement, op, 'click', preventGrabbed);
        regEvent(documentElement, op, 'touchmove', preventGrabbed); // fixes touch devices scrolling while drag
      }

      function destroy() {
        events(true);
        removeContainers(initialContainers);
        release({});
      }

      function preventGrabbed(e) {
        if (shared.grabbed) {
          e.preventDefault();
        }
      }

      function grab(e) {
        e = e || window.event;

        // filter some odd situations
        if ((e.which !== 0 && e.which !== 1) || e.metaKey || e.ctrlKey) {
          return; // we only care about honest-to-god left clicks and touch events
        }

        var context = canStart(e.target);
        if (!context) {
          return;
        }

        shared.grabbed = context;
        eventualMovements();
        if (e.type === 'mousedown') {
          e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
        }
      }

      function startBecauseMouseMoved(e) {
        eventualMovements(true); // remove mousemove listener
        movements();
        end();
        start(shared.grabbed);

        // automaticly detect direction of elements if not set in options
        if (!o.direction) {
          var parent = shared.sourceItem.parentElement,
            parentHeight = parent.offsetHeight,
            parentWidth = parent.offsetWidth,
            childHeight = shared.sourceItem.clientHeight,
            childWidth = shared.sourceItem.clientWidth;
          o.direction = parentHeight / childHeight < parentWidth / childWidth ? 'horizontal' : 'vertical';
        }

        // get initial coordinates, used to render shared.mirror for first time
        var offset = getOffset(shared.sourceItem);
        shared.offsetX = getCoord('pageX', e) - offset.left;
        shared.offsetY = getCoord('pageY', e) - offset.top;
        shared.clientX = getCoord('clientX', e);
        shared.clientY = getCoord('clientY', e);

        // limiting area of shared.mirror movement, get initial coordinates
        if (o.boundingBox) {
          shared.offsetXr = getCoord('pageX', e) - offset.right;
          shared.offsetYb = getCoord('pageY', e) - offset.bottom;
        }

        e.preventDefault();

        addClass(shared.item, o.classes.transit);
        renderMirrorImage();
        // initial position
        shared.mirror.style.left = shared.clientX - shared.offsetX + 'px';
        shared.mirror.style.top = shared.clientY - shared.offsetY + 'px';

        drag(e);
      }


      function canStart(item) {
        if (drake.dragging && shared.mirror) {
          return; // already dragging
        }

        var handle = item;

        while (item.parentElement &&
          !isContainer(item.parentElement)) {
          // break loop if user tries to drag item which is considered invalid handle
          if (o.invalid(item, handle)) {
            return;
          }
          item = item.parentElement; // drag target should be immediate child of container
          if (!item) {
            return;
          }
        }

        var source = item.parentElement;
        if (!source ||
          o.invalid(item, handle) ||
          !o.moves(item, source, handle)) {
          return;
        }

        return {
          item: item,
          source: source
        };
      }

      function manualStart(item) {
        var context = canStart(item);
        if (context) {
          start(context);
        }
      }

      function start(context) {
        shared.sourceItem = shared.item = context.item;
        shared.source = context.source;
        shared.initialSibling = shared.currentSibling = nextEl(context.item);

        if (o.copy) {
          shared.item = context.item.cloneNode(true);
          if (o.scope) {
            o.scope.$emit('cloned', shared.item, context.item);
          }
        }

        // prepare models operations
        if (o.containersModel) {
          var containerIndex = initialContainers.indexOf(context.source);
          shared.sourceModel = o.containersModel[containerIndex];
          shared.initialIndex = domIndexOf(context.item, context.source);
        }

        drake.dragging = true;
        if (o.scope) {
          o.scope.$emit('drag', shared.sourceItem, shared.source);
        }

        return true;
      }

      function invalidTarget() {
        return false;
      }

      function end() {
        if (!drake.dragging) {
          return;
        }
        drop(shared.item, shared.item.parentElement);
      }

      function ungrab() {
        shared.grabbed = false;
        eventualMovements(true);
        movements(true);
      }

      function release(e) {
        ungrab();
        if (!drake.dragging) {
          return;
        }
        e = e || window.event;

        shared.clientX = getCoord('clientX', e);
        shared.clientY = getCoord('clientY', e);

        var elementBehindCursor = getElementBehindPoint(shared.mirror, shared.clientX, shared.clientY),
          dropTarget = findDropTarget(elementBehindCursor, shared.clientX, shared.clientY);

        if (dropTarget && (o.copy === false || dropTarget !== shared.source)) {
          // found valid target and (is not copy case or target is not initial container)
          drop(shared.item, dropTarget);
        } else if (o.removeOnSpill) {
          remove();
        } else {
          cancel();
        }

        // after release there is no container hovered
        shared.targetContainer = null;

        if (shared.lastElementBehindCursor) {
          fireEvent(shared.lastElementBehindCursor, shared.dragOverEvents['dragularrelease'], elementBehindCursor);
        }

        if (o.scope) {
          o.scope.$emit('release', shared.item, shared.source);
        }
      }

      function drop(item, target) {
        if (o.scope && isInitialPlacement(target)) {
          o.scope.$emit('cancel', item, shared.source, shared.sourceModel, shared.initialIndex);
        } else if (o.scope) {
          o.scope.$emit('drop', item, target, shared.source, shared.sourceModel, shared.initialIndex);
        }
        if (o.containersModel && !isInitialPlacement(target)) {
          var dropElm = item,
            dropIndex = domIndexOf(dropElm, target);
          $rootScope.$applyAsync(function applyDrop() {
            if (target === shared.source) {
              shared.sourceModel.splice(dropIndex, 0, shared.sourceModel.splice(shared.initialIndex, 1)[0]);
            } else {
              var targetModel,
                dropElmModel = o.copy ? angular.copy(shared.sourceModel[shared.initialIndex]) : shared.sourceModel[shared.initialIndex];

              if (!shared.isContainerModel) {
                var i = o.nameSpace.length;
                while (i--) {
                  if (drake.containers[o.nameSpace[i]].indexOf(target) !== -1) {
                    targetModel = shared.containersModel[o.nameSpace[i]][drake.containers[o.nameSpace[i]].indexOf(target)];
                    break;
                  }
                }
              } else {
                targetModel = shared.isContainerModel;
              }

              target.removeChild(dropElm); // element must be removed for ngRepeat to apply correctly

              if (!o.copy) {
                shared.sourceModel.splice(shared.initialIndex, 1);
              }
              targetModel.splice(dropIndex, 0, dropElmModel);
            }

            if (item.parentElement) {
              item.parentElement.removeChild(item);
            }
            cleanup();
          });
        } else {
          cleanup();
        }
      }

      function remove() {
        if (!drake.dragging) {
          return;
        }
        var parent = shared.item.parentElement;

        if (parent) {
          parent.removeChild(shared.item);
        }

        if (o.containersModel) {
          $rootScope.$applyAsync(function removeModel() {
            shared.sourceModel.splice(shared.initialIndex, 1);
            cleanup();
          });
        }

        if (o.scope) {
          o.scope.$emit(o.copy ? 'cancel' : 'remove', shared.item, parent, shared.sourceModel, shared.initialIndex);
        }
        if (!o.containersModel) {
          cleanup();
        }
      }

      function cancel(revert) {
        if (!drake.dragging) {
          return;
        }
        var reverts = arguments.length > 0 ? revert : o.revertOnSpill,
          parent = shared.item.parentElement;

        var initial = isInitialPlacement(parent);
        if (initial === false && o.copy === false && reverts) {
          shared.source.insertBefore(shared.item, shared.initialSibling);
        }
        if (o.containersModel && !o.copy && !reverts) {
          drop(shared.item, parent);
        } else if (o.scope) {
          if (initial || reverts) {
            o.scope.$emit('cancel', shared.item, shared.source);
          } else {
            o.scope.$emit('drop', shared.item, parent, shared.source);
          }
        }

        if (!o.containersModel || o.copy || reverts || initial) {
          cleanup();
        }
      }

      function cleanup() {
        ungrab();
        removeMirrorImage();

        if (shared.item) {
          rmClass(shared.item, o.classes.transit);
        }

        drake.dragging = false;

        if (o.removeOnSpill === true) {
          spillOut();
        }

        if (o.scope) {
          o.scope.$emit('out', shared.item, shared.lastDropTarget, shared.source);
          o.scope.$emit('dragend', shared.item);
        }

        shared.source = shared.item = shared.sourceItem = shared.initialSibling = shared.currentSibling = shared.sourceModel = null;
        shared.initialIndex = shared.currentIndex = shared.lastDropTarget = shared.isContainerModel = null;
      }

      // is item currently placed in original container and original position?
      function isInitialPlacement(target, s) {
        var sibling = s || (shared.mirror ? shared.currentSibling : nextEl(shared.item));
        return target === shared.source && sibling === shared.initialSibling;
      }

      // find valid drop container
      function findDropTarget(elementBehindCursor, clientX, clientY) {
        var target = elementBehindCursor;

        while (target && !accepted()) {
          target = target.parentElement;
        }
        return target;

        function accepted() {
          var accepts = false;

          if (isContainer(target)) { // is droppable?

            var immediate = getImmediateChild(target, elementBehindCursor),
              reference = getReference(target, immediate, clientX, clientY),
              initial = isInitialPlacement(target, reference);

            accepts = initial || o.accepts(shared.item, target, shared.source, reference, shared.sourceModel, shared.initialIndex);

            if (shared.targetContainer !== target) { // used for scroll issue
              shared.targetContainer = target;
            }
          }
          return accepts;
        }
      }

      function drag(e) {
        if (!shared.mirror) {
          return;
        }
        e = e || window.event;

        // update coordinates
        shared.clientX = getCoord('clientX', e);
        shared.clientY = getCoord('clientY', e);

        // count mirror coordiates
        var x = shared.clientX - shared.offsetX,
          y = shared.clientY - shared.offsetY,
          pageX,
          pageY,
          offsetBox;

        // fill extra properties if boundingBox is used
        if (o.boundingBox) {
          pageX = getCoord('pageX', e);
          pageY = getCoord('pageY', e);
          offsetBox = getOffset(o.boundingBox);
        }

        if (!o.lockY) {
          if (!o.boundingBox || (pageX > offsetBox.left + shared.offsetX && pageX < offsetBox.right + shared.offsetXr)) {
            shared.mirror.style.left = x + 'px';
          } else if (o.boundingBox) { // check again in case user scrolled the view
            if (pageX < offsetBox.left + shared.offsetX) {
              shared.mirror.style.left = shared.clientX - (pageX - offsetBox.left) + 'px';
            } else {
              shared.mirror.style.left = shared.clientX - shared.mirrorWidth - (pageX - offsetBox.right) + 'px';
            }
          }
        }
        if (!o.lockX) {
          if (!o.boundingBox || (pageY > offsetBox.top + shared.offsetY && pageY < offsetBox.bottom + shared.offsetYb)) {
            shared.mirror.style.top = y + 'px';
          } else if (o.boundingBox) { // check again in case user scrolled the view
            if (pageY < offsetBox.top + shared.offsetY) {
              shared.mirror.style.top = shared.clientY - (pageY - offsetBox.top) + 'px';
            } else {
              shared.mirror.style.top = shared.clientY - shared.mirrorHeight - (pageY - offsetBox.bottom) + 'px';
            }
          }
        }

        var elementBehindCursor = getElementBehindPoint(shared.mirror, shared.clientX, shared.clientY),
          dropTarget = findDropTarget(elementBehindCursor, shared.clientX, shared.clientY),
          changed = dropTarget !== shared.lastDropTarget;

        if (elementBehindCursor !== shared.lastElementBehindCursor) {
          fireEvent(elementBehindCursor, shared.dragOverEvents['dragularenter'], !!dropTarget);
          if (shared.lastElementBehindCursor) {
            fireEvent(shared.lastElementBehindCursor, shared.dragOverEvents['dragularleave'], elementBehindCursor);
          }
          shared.lastElementBehindCursor = elementBehindCursor;
        }

        if (changed) {
          out();
          shared.lastDropTarget = dropTarget;
          over();
        }

        // do not copy in same container
        if (dropTarget === shared.source && o.copy) {
          if (shared.item.parentElement) {
            shared.item.parentElement.removeChild(shared.item);
          }
          return;
        }

        var reference,
          immediate = getImmediateChild(dropTarget, elementBehindCursor);

        if (immediate !== null) {
          reference = getReference(dropTarget, immediate, shared.clientX, shared.clientY);
        } else if (o.revertOnSpill === true && !o.copy) {
          // the case that mirror is not over valid target and reverting is on and copy is off
          reference = shared.initialSibling;
          dropTarget = shared.source;
        } else {
          // the case that mirror is not over valid target and removing is on or copy is on
          if (o.copy && shared.item.parentElement !== null) {
            // remove item or copy of item
            shared.item.parentElement.removeChild(shared.item);
          }
          return;
        }
        if (reference === null ||
          reference !== shared.item &&
          reference !== nextEl(shared.item) &&
          reference !== shared.currentSibling) {
          // moving item/copy to new container from previous one
          shared.currentSibling = reference;

          dropTarget.insertBefore(shared.item, reference); // if reference is null item is inserted at the end

          if (o.scope) {
            o.scope.$emit('shadow', shared.item, dropTarget);
          }
        }

        function moved(type) {
          if (o.scope) {
            o.scope.$emit(type, shared.item, shared.lastDropTarget, shared.source);
          }
          if (o.removeOnSpill === true) {
            type === 'over' ? spillOver() : spillOut();
          }
        }

        function over() {
          if (changed) {
            moved('over');
          }
        }

        function out() {
          if (shared.lastDropTarget) {
            moved('out');
          }
        }
      }

      function spillOver() {
        rmClass(shared.item, o.classes.hide);
      }

      function spillOut() {
        if (drake.dragging) {
          addClass(shared.item, o.classes.hide);
        }
      }

      function scrollContainer(e) {
        if (shared.targetContainer) {
          var before = shared.targetContainer.scrollTop;
          shared.targetContainer.scrollTop += e.deltaY;
          // block scroll of the document when container can be scrolled
          if (before !== shared.targetContainer.scrollTop) {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      }

      function renderMirrorImage() {
        if (shared.mirror) {
          return;
        }
        var rect = shared.sourceItem.getBoundingClientRect();
        shared.mirror = shared.sourceItem.cloneNode(true);
        shared.mirrorWidth = rect.width;
        shared.mirrorHeight = rect.height;
        shared.mirror.style.width = getRectWidth(rect) + 'px';
        shared.mirror.style.height = getRectHeight(rect) + 'px';
        rmClass(shared.mirror, o.classes.transit);
        addClass(shared.mirror, o.classes.mirror);
        o.mirrorContainer.appendChild(shared.mirror);
        regEvent(documentElement, 'on', 'mousemove', drag);
        addClass(body, o.classes.unselectable);
        regEvent(shared.mirror, 'on', 'wheel', scrollContainer);
        if (o.scope) {
          o.scope.$emit('cloned', shared.mirror, shared.sourceItem);
        }
      }

      function removeMirrorImage() {
        if (shared.mirror) {
          rmClass(body, o.classes.unselectable);
          regEvent(documentElement, 'off', 'mousemove', drag);
          regEvent(shared.mirror, 'off', 'wheel', scrollContainer);
          shared.mirror.parentElement.removeChild(shared.mirror);
          shared.mirror = null;
        }
      }

      function getImmediateChild(dropTarget, target) {
        var immediate = target;
        while (immediate !== dropTarget && immediate.parentElement !== dropTarget) {
          immediate = immediate.parentElement;
        }
        if (immediate === documentElement) {
          return null;
        }
        return immediate;
      }

      function getReference(dropTarget, target, x, y) {
        var horizontal = o.direction === 'horizontal',
          reference = target !== dropTarget ? inside() : outside();
        return reference;

        function outside() { // slower, but able to figure out any position
          var len = dropTarget.children.length,
          i, el, rect;
          for (i = 0; i < len; i++) {
            el = dropTarget.children[i];
            rect = el.getBoundingClientRect();
            if (horizontal && rect.left > x) {
              return el;
            }
            if (!horizontal && rect.top > y) {
              return el;
            }
          }
          return null;
        }

        function inside() { // faster, but only available if dropped inside a child element
          var rect = target.getBoundingClientRect();
          if (horizontal) {
            return resolve(x > rect.left + getRectWidth(rect) / 2);
          }
          return resolve(y > rect.top + getRectHeight(rect) / 2);
        }

        function resolve(after) {
          return after ? nextEl(target) : target;
        }
      }

      function getScroll(scrollProp, offsetProp) {
        if (typeof window[offsetProp] !== 'undefined') {
          return window[offsetProp];
        }
        if (documentElement.clientHeight) {
          return documentElement[scrollProp];
        }
        return body[scrollProp];
      }

      function getOffset(el) {
        var rect = el.getBoundingClientRect(),
          scrollTop = getScroll('scrollTop', 'pageYOffset'),
          scrollLeft = getScroll('scrollLeft', 'pageXOffset');
        return {
          left: rect.left + scrollLeft,
          right: rect.right + scrollLeft,
          top: rect.top + scrollTop,
          bottom: rect.bottom + scrollTop
        };
      }

      function getElementBehindPoint(point, x, y) {
        var p = point || {},
          state = p.className,
          el;
        p.className += ' ' + o.classes.hide;
        el = document.elementFromPoint(x, y);
        p.className = state;
        return el;
      }
    };

  // clean common/shared objects
  serviceFn.cleanEnviroment = function cleanEnviroment() {
    shared.classesCache = {};
    shared.containersModel = {};
    shared.containers = {};
    shared.mirror = undefined;
  };

  serviceFn.shared = shared;

  return serviceFn;

  /****************************************************************************************************************************/
  /****************************************************************************************************************************/
  /****************************************************************************************************************************/

  // HELPERS FUNCTIONS:

  function regEvent(el, op, type, fn) {
    var touch = {
        mouseup: 'touchend',
        mousedown: 'touchstart',
        mousemove: 'touchmove'
      },
      $el = angular.element(el);

    if (touch[type]) {
      $el[op](touch[type], fn);
    }
    $el[op](type, fn);
  }

  function never() {
    return false;
  }

  function always() {
    return true;
  }

  function emptyObj() {
    return {};
  }

  function nextEl(el) {
    return el.nextElementSibling || manually();

    function manually() {
      var sibling = el;
      do {
        sibling = sibling.nextSibling;
      } while (sibling && sibling.nodeType !== 1);
      return sibling;
    }
  }

  //Cannot use angular.isElement because we need to check plain dom element, no jQlite wrapped
  function isElement(o) {
    return (
      typeof HTMLElement === 'object' ? o instanceof HTMLElement : //DOM2
      o && typeof o === 'object' && o !== null && o.nodeType === 1 && typeof o.nodeName === 'string'
    );
  }

  function lookupClass(className) {
    var cached = shared.classesCache[className];
    if (cached) {
      cached.lastIndex = 0;
    } else {
      shared.classesCache[className] = cached = new RegExp('(?:^|\\s)' + className + '(?:\\s|$)', 'g');
    }
    return cached;
  }

  function addClass(el, className) {
    var current = el.className;
    if (!current.length) {
      el.className = className;
    } else if (!lookupClass(className).test(current)) {
      el.className += ' ' + className;
    }
  }

  function rmClass(el, className) {
    el.className = el.className.replace(lookupClass(className), ' ').trim();
  }

  function getEventHost(e) {
    // on touchend event, we have to use `e.changedTouches`
    // see http://stackoverflow.com/questions/7192563/touchend-event-properties
    // see https://github.com/bevacqua/dragula/issues/34
    if (e.targetTouches && e.targetTouches.length) {
      return e.targetTouches[0];
    }
    if (e.changedTouches && e.changedTouches.length) {
      return e.changedTouches[0];
    }
    return e;
  }

  function getCoord(coord, e) {
    var host = getEventHost(e);
    var missMap = {
      pageX: 'clientX', // IE8
      pageY: 'clientY' // IE8
    };
    if (coord in missMap && !(coord in host) && missMap[coord] in host) {
      coord = missMap[coord];
    }
    return host[coord];
  }

  function getRectWidth(rect) {
    return rect.width || (rect.right - rect.left);
  }

  function getRectHeight(rect) {
    return rect.height || (rect.bottom - rect.top);
  }

  function domIndexOf(child, parent) {
    return Array.prototype.indexOf.call(angular.element(parent).children(), child);
  }

  function fireEvent(target, e, extra) {
    if (!target) {
      return;
    }
    shared.extra = extra;
    if (target.dispatchEvent) {
      target.dispatchEvent(e);
    } else {
      target.fireEvent('on' + e.eventType, e);
    }
  }

}]);