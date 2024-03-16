// const element1 = <h1 title="foo">hello</h1>
// const element1 = createElement("h1", { title: "foo" }, "hello");
// const element1 = {
//   type: "h1",
//   props: {
//     title: "foo",
//     children: "hello",
//   },
// };

// const element = React.createElement(
//     "div",
//     { id: "foo" },
//     React.createElement("span", null, "bar"),
//     React.createElement("p")
//   )
// const element = React.createElement(
//   "div",
//   { id: "foo" },
//   {
//     type: "span",
//     props: {
//       children: [
//         {
//           type: "TEXT_ELEMENT",
//           props: {
//             nodeValue: "bar",
//             children: [],
//           },
//         },
//       ],
//     },
//   },
//   {
//     type: "p",
//     props: {
//       children: [],
//     },
//   }
// );

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map(child => typeof child === "object" ? child : createTextElement(child))
    }
  };
}
function render(element, container) {
  const dom = element.type === "TEXT_ELEMENT" ? document.createTextNode("") : document.createElement(element.type);
  const isProperty = key => key !== "children";
  Object.keys(element.props).filter(isProperty).forEach(name => dom[name] = element.props[name]);
  element.props.children.forEach(child => render(child, dom));
  container.appendChild(dom);
}
const Didact = {
  createElement,
  render
};

/** @jsx Didact.createElement */
const element = Didact.createElement("div", {
  id: "foo"
}, Didact.createElement("span", null, "bar"), Didact.createElement("p", null, "text"), Didact.createElement("button", null, "click"), "hhhh", Didact.createElement("input", null));
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

const container = document.getElementById("root");
Didact.render(element, container);
