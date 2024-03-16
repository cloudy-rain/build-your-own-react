function createElement(type, props?, ...children): ReactElement {
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
  type?: string | Function;
  props: { children: ReactElement[]; [k: string]: any };
};

type Fiber = ReactElement & {
  dom?: any;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber;
  effectTag?: string;
  hooks?: [];
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
  console.log("commitRoot");
  console.log(wipRoot);

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

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }

  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    // And if it’s an UPDATE, we need to update the existing DOM node with the props that changed.
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent); // function component fiber 只会有一个child
  }
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
 * perform work: 1）create dom; 2)create the fibers for the element’s children
 *
 */
function performUnitOfWork(fiber: Fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

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

let wipFiber = null;
let hookIndex = null;
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)]; // 妙蛙.  function component fiber 只会有一个child. function component 无论如何都会执行
  reconcileChildren(fiber, children);
}
function useState(initial) {
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
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
 * 1. create new  fibers from 'elements' for 'wipFiber'
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

let nextUnitOfWork: Fiber = null; // piece of wipRoot，每一个fiber节点就是一个公共单元。
let wipRoot: Fiber = null; // work in progress fiber root, 当前正在构造的fiber树的根fiber节点
let currentRoot: Fiber = null; // last commit fiber root， 上一次commit(更新dom)的fiber树的根fiber节点
let deletions: Fiber[] = null; // an array to keep track of the nodes we want to remove in currentRoot. 因为要删除的节点不会向添加和更新一样创建新的fiber节点，而wipRoot不包含old fiber， 所以需要额外的数据结构记录要被删除的旧节点。
function workLoop(deadline) {
  let shouldYield = false;

  // render阶段，不断调用performUnitOfWork构造fiber树，该阶段可中断。
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  // wipRoot根节点表示的fiber树已经全部构造完毕， 进入commit阶段（不能中断），更新dom
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop); // 类似setTimeout，不过调用的时间不是自己设置，而是浏览器在空闲的时候主动调用workLoop函数

const Didact = {
  createElement,
  render,
};

// jsx (use babel)-> React.createElement() -> 返回element对象
function Counter() {
  const [state, setState] = useState(1);

  // return <h1 onClick={() => setState((c) => c + 1)}>`Count: ${state}`</h1>

  return Didact.createElement(
    "h1",
    {
      onclick: () => setState((c) => c + 1),
    },
    `Count: ${state}`
  );
}

const container = document.getElementById("root");
// Didact.render(<Counter />, container);
Didact.render(Didact.createElement(Counter), container);
