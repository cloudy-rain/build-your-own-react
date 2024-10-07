function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child),
      ),
    },
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}
function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (pre, next) => (key) => pre[key] !== next[key];
const isGone = (pre, next) => (key) => !(key in next);
function updateDom(dom, preProps, nextProps) {
  // Remove old properties
  Object.keys(preProps)
    .filter(isProperty)
    .filter(isGone(preProps, nextProps))
    .forEach((name) => (dom[name] = ""));

  // Remove old or changed event listeners
  Object.keys(preProps)
    .filter(isEvent)
    .filter(
      (key) =>
        isGone(preProps, nextProps)(key) || isNew(preProps, nextProps)(key),
    )
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, preProps[name]);
    });

  // Add new properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(preProps, nextProps))
    .forEach((name) => (dom[name] = nextProps[name]));

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

function commitRoot() {
  console.log(wipRoot);
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  // fiber.dom != null会跳过funciton component
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
    return;
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

// In the render function we set nextUnitOfWork to the root of the fiber tree.
function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot, // This property is a link to the old fiber,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let wipRoot = null; //  work in progress root
let currentRoot = null; // last fiber tree we committed to the DOM
let deletions = [];

// So we are going to break the work into small units,
// and after we finish each unit we’ll let the browser interrupt the rendering(通过shouldYield) if there’s anything else that needs to be done.
let nextUnitOfWork = null;
function workLoop(deadline) {
  // console.log("-----------------workLoop--------------");
  let shouldYield = false;

  // console.log("---------before while---------");

  // from: https://developer.mozilla.org/en-US/docs/Web/API/Background_Tasks_API#getting_the_most_out_of_idle_callbacks
  // Window.requestIdleCallback() makes it possible to become actively engaged in helping to ensure that the browser's event loop runs smoothly,
  // by allowing the browser to tell your code how much time it can safely use without causing the system to lag.
  // !!!!If you stay within the limit given, you can make the user's experience much better.
  // 循环结束条件: 没有工作单元了 或者 没有时间了
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    console.log(`deadline.timeReamining(): ${deadline.timeRemaining()}`);
    shouldYield = deadline.timeRemaining() < 1;
  }
  // console.log("---------break while---------", !!nextUnitOfWork, shouldYield);

  // firber树构建完毕, 进入commit阶段
  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  // You can call requestIdleCallback() within an idle callback function
  // to schedule --another callback-- to take place no sooner than the next pass through the event loop.
  // from: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
  requestIdleCallback(workLoop);
}

// We use requestIdleCallback to make a loop.
// You can think of requestIdleCallback as a setTimeout(都是异步, 不过一个是自己设定最小调用时间,一个是浏览器决定调用时间),
// but instead of us telling it when to run,
// the browser will run the callback when the main thread is idle.
// React doesn’t use requestIdleCallback anymore. Now it uses the scheduler package. But for this use case it’s conceptually the same.
// From React(https://github.com/facebook/react/issues/11171#issuecomment-417349573):
// FWIW we've since stopped using requestIdleCallback because it's not as aggressive as we need. Instead we use a polyfill that's internally implemented on top of requestAnimationFrame. Although conceptually we still use it to do idle work.
requestIdleCallback(workLoop);

// not only performs the work but also returns the next unit of work
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // 3.select the next unit of work
  // try with the child, then with the sibling, then with the uncle, and so on.
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

let wipFiber = null;
let hookIndex = null;
/**
 * 1.running the function to get children
 * 2.create the fibers for the element’s children --> reconcileChildren()
 * @param {*} fiber
 */
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = []; // to support calling useState several times in the same component.
  const children = [fiber.type(fiber.props)];
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
  actions.forEach((action) => (hook.state = action(hook.state))); //  apply actions one by one to the new hook state

  const setState = (action) => {
    hook.queue.push(action);
    // start a new render phase.
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props, // 仍旧用上一个children: [element] 渲染, 在reconcileChildren方法中所有的Fiber都被判定为UPDATE, 但是Fiber中的hooks中存放了一些新的数据, 所以页面依旧会更新
      alternate: currentRoot, // 上一个children: [element]渲染的
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;

  return [hook.state, setState];
}
/**
 * 1.create DOM
 * 2.create the fibers for the element’s children --> reconcileChildren()
 * @param {*} fiber
 */
function updateHostComponent(fiber) {
  // 1.create DOM
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // 2.create the fibers for the element’s children
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber?.alternate?.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType = oldFiber && element && element.type === oldFiber.type;

    if (sameType) {
      // UPDATE
      newFiber = {
        type: oldFiber.type,
        dom: oldFiber.dom, // keeping the DOM node from the old fiber
        props: element.props, // and the props from the element.
        parent: wipFiber,
        alternate: oldFiber, //
        effectTag: "UPDATE",
      };
    }
    if (element && !sameType) {
      // ADD
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    if (oldFiber && !sameType) {
      // DELETE
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

const Didact = {
  createElement,
  render,
  useState,
};

const handleClick = () => {
  Didact.render(
    <div id="foo" class="foo">
      hhhh
      <span>bar</span>
      <div>
        <span>a span</span>
      </div>
      <a>a</a>
    </div>,
    container,
  );
};

const element = (
  <div id="foo">
    hhhh
    <span>bar</span>
    <div>
      <span>a span</span>
    </div>
    <button onClick={handleClick}>click</button>
  </div>
);
// const element = {
//   type: "div",
//   props: {
//     id: "foo",
//     children: [
//       {
//         type: "span",
//         props: {
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "bar",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//       {
//         type: "p",
//         props: {
//           children: [
//             {
//               type: "TEXT_ELEMENT",
//               props: {
//                 nodeValue: "foo",
//                 children: [],
//               },
//             },
//           ],
//         },
//       },
//     ],
//   },
// };
// console.log(createElement("a", null, "bar"));
// console.log(
//   createElement(
//     "div",
//     { id: "foo" },
//     createElement("a", null, "bar"),
//     createElement("b")
//   )
// );

const handleClick2 = () => {
  Didact.render(<App name="bar" />, container);
};
/** @jsx Didact.createElement */
function App(props) {
  return (
    <div>
      <h1>Hi {props.name}</h1>
      <button onClick={handleClick2}>click</button>
    </div>
  );
}

function Counter() {
  const [state, setState] = Didact.useState(1);
  return <h1 onClick={() => setState((c) => c + 1)}>Count: {state}</h1>;
}
const container = document.getElementById("root");

Didact.render(<Counter />, container);
