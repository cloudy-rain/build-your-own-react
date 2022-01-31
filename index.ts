function createElement(type, props, ...children): ReactElement {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

function createTextElement(text): ReactElement {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

// 为fiber节点创建对应的dom节点
function createDom(fiber) {
  console.log("createDom", fiber.type);
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);
  const isProperty = (key) => key !== "children";
  Object.keys(fiber.props)
    .filter(isProperty)
    .forEach((name) => {
      dom[name] = fiber.props[name];
    });

  return dom;
}

type ReactElement = {
  type: string;
  props: { children: ReactElement[]; [k: string]: any };
};

type Fiber = ReactElement & {
  dom?: any;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber;
  effectTag?: string;
};

function render(element, container) {
  // 每次调用render都会构造一个新的wipRoot, 用来表示work in press fiber root
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot, // alternate记录上一次commit的currentRoot
  };
  nextUnitOfWork = wipRoot; // 重置
  deletions = []; // 重置
}

function commitRoot() {
  // remove the "DELETION" effect in currentRoot
  deletions.forEach(commitWork);

  // "PLACEMENT" & "UPDATE" node
  commitWork(wipRoot.child);

  currentRoot = wipRoot; // 记录上一次commit的fiber tree
  wipRoot = null; // 当前的 ‘work in progress‘ 结束
}

function commitWork(fiber: Fiber) {
  if (!fiber) {
    return;
  }

  const domParent = fiber.parent.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "DELETION") {
    domParent.removeChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    // And if it’s an UPDATE, we need to update the existing DOM node with the props that changed.
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });

  // remove old props
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => (dom[name] = ""));

  // set new or changed props
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });
}

/**
 * perform work & return next unit of work
 */
function performUnitOfWork(fiber: Fiber) {
  // 1) if no dom, create dom for fiber node
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // 2) create children fibers
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);

  // 3) return next unit of work
  // child
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    // sibling
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // uncle
    nextFiber = nextFiber.parent;
  }
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
function reconcileChildren(wipFiber: Fiber, elements: ReactElement[]) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child; // correspond to elements
  let preSibling = null;

  while (index < elements.length || oldFiber != null) {
    let newFiber: Fiber;
    const el = elements[index];

    const sameType = oldFiber && el && el.type === oldFiber.type;

    if (sameType) {
      // update the node
      newFiber = {
        type: oldFiber.type,
        props: el.props,
        dom: oldFiber.dom, // TODO: why?? commit阶段用这个dom来进行更新
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }

    if (el && !sameType) {
      // add this node
      newFiber = {
        type: el.type,
        props: el.props,
        dom: null, // FIXME
        parent: wipFiber,
        alternate: null, // FIXME:
        effectTag: "PLACEMENT",
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
    } else {
      preSibling.sibling = newFiber;
    }
    preSibling = newFiber;

    index++;
  }
}

let nextUnitOfWork = null; // piece of wipRoot
let wipRoot = null; // work in progress fiber root
let currentRoot = null; // last commit fiber root
let deletions = null; // an array to keep track of the nodes we want to remove in currentRoot.
function workLoop(deadline) {
  let shouldYield = false;
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

const Didact = {
  createElement,
  render,
};

// jsx (use babel)-> React.createElement() -> 返回element对象
// const element: ReactElement = {
//   type: "div",
//   props: {
//     children: [
//       {
//         type: "h1",
//         props: {
//           title: "foo",
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "hello world",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//       {
//         type: "h1",
//         props: {
//           title: "foo",
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "hello summer",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//     ],
//   },
// };
// const element2: ReactElement = {
//   type: "div",
//   props: {
//     children: [
//       {
//         type: "App1",
//         props: {
//           title: "foo",
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "hello world",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//       {
//         type: "App2",
//         props: {
//           title: "foo",
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "hello new day",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//     ],
//   },
// };

/** @jsx Didact.createElement */
// const element = (
//   <div style="background: salmon">
//     <h1>Hello World</h1>
//     <h2 style="text-align:right">from Didact</h2>
//   </div>
// );

function App(props) {
  return <h1>hi {props.name}</h1>;
}
const element = <App name="foo" />;

const container = document.getElementById("root");
Didact.render(element, container);
