# 代码来自

https://pomb.us/build-your-own-react/

# 一些关键问题

- 为什么会出现 Fiber？
  在早期的 React 设计中调和(FIXME: 调和或许不太准确)过程是递归的，也就是无法中断， 将长时间占用浏览器页面主线程，导致高优先级的任务(比如响应用户输入)被阻塞，所以需要重新设计 React 的调和过程， 让其具备可中断性，可以将线程让给高优先级的任务。而 Fiber 就是为了实现可中断的而设计的数据结构， 每一个 Fiber 节点代表一个调和过程中的一个小的工作单元， 各个 Fiber 节点之间的关系构成了 Fiber 树.

- 利用 Fiber 是如何做到可中断的？
- 为什么需要分 Render 阶段和 Commit 阶段？
  Render 阶段(可中断)往往指的是构造 Fiber 树的阶段，Commit 阶段(不可中断)指的是更新 dom 的阶段。
  React 团队希望调和过程是可中断的， 如果不区分 Render 和 Commit，将两个阶段放到一起，那么就会出现任务被中断而页面的 dom 只更新了一部分，用户看到不完整的 UI 的情况。
  为了解决上面说的这个问题， 所以区分 Render 阶段和 Commit 阶段。

- ReactElement 和 Fiber 节点 的关系 ？
  ReactElement 和 Fiber 节点 的类型定义中有很多相似的属性。ReactElement 用来构造 Fiber 节点的，也就是是说在每次的渲染流程中我们用新的 ReactElement 去构造新的 Fiber 树

# build-your-own-react 实现的 React 的核心流程

从宏观和微观两个角度来分析：

## 宏观

- 通过不停的掉用 requestIdleCallback(workLoop)来让浏览器在空闲的时候执行 workLoop
- workLoop 判断是否有 Fiber 工作单元(nextUnitOfWork)要处理，如果有， 开始调和（可中断的 render 阶段 + 不可中断的 commit 阶段）， 并在浏览器分配时间耗尽的时候中断调和过程，将线程交给其他任务。
- render 阶段 会在浏览器分配的时间消耗完毕前通过不断调用 performUnitOfWork 来 构造完整的 Fiber 树
- commit 阶段 位于 render 阶段 的下一个阶段。 当没有 Fiber 工作单元(nextUnitOfWork)要处理， 并且当前存在一个未被更新到 dom 的 Fiber 树(wipRoot)时，开启将 Fiber 树更新到 dom 中

## 微观

### performUnitOfWork 的功能

- 如果有需要，为当前的 Fiber 节点创建 dom
- 为当前 Fiber 节点的 children 元素，构造新的 Fiber 节点， 并为新的 Fiber 节点设置好连接关系（parent，child， sibling）
- 返回下一个 Fiber 工作单元（child， sibling，uncle），用于下一次调用 performUnitOfWork。

### 初次渲染

- render 函数利用 ReactElement 构造出新的 Fiber 根节点，并用其设置 wipRoot 和 nextUnitOfWork
- 多次执行 performUnitOfWork，每执行一次为参数对应的 Fiber 节点创建 dom 和所有的子 Fiber
- 当没有下一个 Fiber 工作单元（nextUnitOfWork）要处理时， 整个 Fiber 树 构建完毕，每个 Fiber 节点上已经有对应的 dom
- 执行 commitRoot，通过递归的方式将 Fiber 树的上每个节点对应的 dom 更新到页面上， 准确来说是将所有 dom 插入到页面

### 更新

- 通过新的 ReactElement 再次设置适当的 wipRoot 和 nextUnitOfWork 来开启更新流程
- 与初次渲染时一样多次执行 performUnitOfWork， 不过在更新的流程中执行 performUnitOfWork 并不会为 Fiber 节点创建 dom， 而是在构造 Fiber 的时候复用上一次 commit 时对应的 dom（如果有的话）
- 当没有下一个 Fiber 工作单元（nextUnitOfWork）要处理时， 整个 Fiber 树 构建完毕，每个 Fiber 节点上已经有对应的 dom
- 执行 commitRoot，通过递归的方式将 Fiber 树的上每个节点对应的 dom 更新到页面上， 准确来说是对每一个 dom 节点根据之前的 props 和现在的 props 差异 做 dom 属性的修改

### 在更新阶段是如何做到复用之前的 dom 节点

- 双缓存

  - React 都会记录两颗 Fiber 树。 一个是 currentRoot 所指向的 Fiber 树， 它代表最近一次更新到 dom 的 Fiber 树； 另一个是 wipRoot 所指向的 Fiber 树，它代表正在构建（根据最新的 ReactElement）的 Fiber 树， 是即将更新到 dom 的 Fiber 树。wipRoot 会有一个 alternate 属性， 其值就是 currentRoot。
  - 每次调和的开始（render 阶段前）设置新的 wipRoot，并设置 wip.alternate 为 currentRoot。
  - 每次调和的收尾（commit 阶段后）将 currentRoot 设置为 wipRoot， wip 设置为 null

- performUnitOfWork 构造 Fiber 节点
  - 初次渲染阶段 currentRoot 为 null， 也就是 wipRoot.alternate 为 null，在构造 Fiber 的时候没有旧 Fiber 节点，所以根据 ReactElement 完全重新创建一个没有 dom 属性 的 Fiber， 之后如果以该 Fiber 为参数调用 performUnitOfWork，就会为它创建 dom
  - 更新阶段 wipRoot.alternate 有效， 是上一次 commit 的 Fiber 树，在构造 Fiber 的时候可以根据 alternate 属性找到 旧 Fiber 节点，所以需要判断新 ReactElement 的 type 是否和旧 Fiber 节点 的 type 相同。 相同就标记为“UPDATE”重用旧 Fiber 节点 的 dom； 不同的话将新 Fiber 节点 标记为“PLACEMENT”，旧 Fiber 节点标记为“DELETE”
