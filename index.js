var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
function createElement(type, props) {
    var children = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        children[_i - 2] = arguments[_i];
    }
    return {
        type: type,
        props: __assign(__assign({}, props), { children: children.map(function (child) {
                return typeof child === "object" ? child : createTextElement(child);
            }) })
    };
}
function createTextElement(text) {
    return {
        type: "TEXT_ELEMENT",
        props: {
            nodeValue: text,
            children: []
        }
    };
}
// 为fiber节点创建对应的dom节点
function createDom(fiber) {
    console.log("createDom", fiber.type);
    var dom = fiber.type == "TEXT_ELEMENT"
        ? document.createTextNode("")
        : document.createElement(fiber.type);
    var isProperty = function (key) { return key !== "children"; };
    Object.keys(fiber.props)
        .filter(isProperty)
        .forEach(function (name) {
        dom[name] = fiber.props[name];
    });
    return dom;
}
function render(element, container) {
    // 每次调用render都会构造一个新的wipRoot, 用来表示work in press fiber root
    wipRoot = {
        dom: container,
        props: {
            children: [element]
        },
        alternate: currentRoot
    };
    nextUnitOfWork = wipRoot; // 重置
    deletions = []; // 重置
}
function commitRoot() {
    console.log("commitRoot");
    console.log(wipRoot);
    // remove the "DELETION" effect in currentRoot
    deletions.forEach(commitWork);
    // "PLACEMENT" & "UPDATE" node
    commitWork(wipRoot.child);
    currentRoot = wipRoot; // 记录上一次commit的fiber tree
    wipRoot = null; // 当前的 ‘work in progress‘ 结束
}
function commitWork(fiber) {
    if (!fiber) {
        return;
    }
    var domParentFiber = fiber.parent;
    while (!domParentFiber.dom) {
        domParentFiber = domParentFiber.parent;
    }
    var domParent = domParentFiber.dom;
    if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
        domParent.appendChild(fiber.dom);
    }
    else if (fiber.effectTag === "DELETION") {
        commitDeletion(fiber, domParent);
    }
    else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
        // And if it’s an UPDATE, we need to update the existing DOM node with the props that changed.
        updateDom(fiber.dom, fiber.alternate.props, fiber.props);
    }
    commitWork(fiber.child);
    commitWork(fiber.sibling);
}
function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
        domParent.removeChild(fiber.dom);
    }
    else {
        commitDeletion(fiber.child, domParent); // function component fiber 只会有一个child
    }
}
var isEvent = function (key) { return key.startsWith("on"); };
var isProperty = function (key) { return key !== "children" && !isEvent(key); };
var isNew = function (prev, next) { return function (key) { return prev[key] !== next[key]; }; };
var isGone = function (prev, next) { return function (key) { return !(key in next); }; };
function updateDom(dom, prevProps, nextProps) {
    //Remove old or changed event listeners
    Object.keys(prevProps)
        .filter(isEvent)
        .filter(function (key) { return !(key in nextProps) || isNew(prevProps, nextProps)(key); })
        .forEach(function (name) {
        var eventType = name.toLowerCase().substring(2);
        dom.removeEventListener(eventType, prevProps[name]);
    });
    // Add event listeners
    Object.keys(nextProps)
        .filter(isEvent)
        .filter(isNew(prevProps, nextProps))
        .forEach(function (name) {
        var eventType = name.toLowerCase().substring(2);
        dom.addEventListener(eventType, nextProps[name]);
    });
    // remove old props
    Object.keys(prevProps)
        .filter(isProperty)
        .filter(isGone(prevProps, nextProps))
        .forEach(function (name) { return (dom[name] = ""); });
    // set new or changed props
    Object.keys(nextProps)
        .filter(isProperty)
        .filter(isNew(prevProps, nextProps))
        .forEach(function (name) {
        dom[name] = nextProps[name];
    });
}
/**
 * perform work & return next unit of work
 */
function performUnitOfWork(fiber) {
    var isFunctionComponent = fiber.type instanceof Function;
    if (isFunctionComponent) {
        updateFunctionComponent(fiber);
    }
    else {
        updateHostComponent(fiber);
    }
    // 3) return next unit of work
    // child
    if (fiber.child) {
        return fiber.child;
    }
    var nextFiber = fiber;
    while (nextFiber) {
        // sibling
        if (nextFiber.sibling) {
            return nextFiber.sibling;
        }
        // uncle
        nextFiber = nextFiber.parent;
    }
}
var wipFiber = null;
var hookIndex = null;
function updateFunctionComponent(fiber) {
    wipFiber = fiber;
    hookIndex = 0;
    wipFiber.hooks = [];
    var children = [fiber.type(fiber.props)]; // 妙蛙.  function component fiber 只会有一个child
    reconcileChildren(fiber, children);
}
function useState(initial) {
    var oldHook = wipFiber.alternate &&
        wipFiber.alternate.hooks &&
        wipFiber.alternate.hooks[hookIndex];
    var hook = {
        state: oldHook ? oldHook.state : initial,
        queue: []
    };
    var actions = oldHook ? oldHook.queue : [];
    actions.forEach(function (action) {
        hook.state = action(hook.state);
    });
    var setState = function (action) {
        hook.queue.push(action);
        wipRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot
        };
        nextUnitOfWork = wipRoot;
        deletions = [];
    };
    wipFiber.hooks.push(hook);
    hookIndex++;
    return [hook.state, setState];
}
function updateHostComponent(fiber) {
    // 1) if no dom, create dom for fiber node
    if (!fiber.dom) {
        fiber.dom = createDom(fiber);
    }
    // 2) create children fibers
    reconcileChildren(fiber, fiber.props.children);
}
/**
 *
 * @param wipFiber parent fiber
 * @param elements children elements
 * 1. create new f fibers from 'elements' for 'wipFiber'
 * 2. reconcile the old fibers with the new elements
 *  We iterate at the same time over the children of the old fiber (wipFiber.alternate) and the array of elements we want to reconcile.
 *  The element is the thing we want to render to the DOM and the oldFiber is what we rendered the last time.
 */
function reconcileChildren(wipFiber, elements) {
    var index = 0;
    var oldFiber = wipFiber.alternate && wipFiber.alternate.child; // correspond to elements
    var preSibling = null;
    while (index < elements.length || oldFiber != null) {
        var newFiber = void 0;
        var el = elements[index];
        var sameType = oldFiber && el && el.type === oldFiber.type;
        if (sameType) {
            // update the node
            newFiber = {
                type: oldFiber.type,
                props: el.props,
                dom: oldFiber.dom,
                parent: wipFiber,
                alternate: oldFiber,
                effectTag: "UPDATE"
            };
        }
        if (el && !sameType) {
            // add this node
            newFiber = {
                type: el.type,
                props: el.props,
                dom: null,
                parent: wipFiber,
                alternate: null,
                effectTag: "PLACEMENT"
            };
        }
        if (oldFiber && !sameType) {
            // delete the oldFiber's node
            oldFiber.effectTag = "DELETION";
            deletions.push(oldFiber);
        }
        if (oldFiber) {
            oldFiber = oldFiber.sibling;
        }
        if (index === 0) {
            wipFiber.child = newFiber;
        }
        else {
            preSibling.sibling = newFiber;
        }
        preSibling = newFiber;
        index++;
    }
}
var nextUnitOfWork = null; // piece of wipRoot
var wipRoot = null; // work in progress fiber root
var currentRoot = null; // last commit fiber root
var deletions = null; // an array to keep track of the nodes we want to remove in currentRoot.
function workLoop(deadline) {
    var shouldYield = false;
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldYield = deadline.timeRemaining() < 1;
    }
    if (!nextUnitOfWork && wipRoot) {
        commitRoot();
    }
    requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop);
var Didact = {
    createElement: createElement,
    render: render
};
// jsx (use babel)-> React.createElement() -> 返回element对象
function Counter() {
    var _a = useState(1), state = _a[0], setState = _a[1];
    return Didact.createElement("h1", {
        onclick: function () { return setState(function (c) { return c + 1; }); }
    }, "Count: ".concat(state));
}
var container = document.getElementById("root");
Didact.render(Didact.createElement(Counter), container);
