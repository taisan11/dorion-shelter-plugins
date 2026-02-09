const {
  util: { log }
} = shelter

let observer: MutationObserver | null = null
const pendingRequests = new Set<WaitRequest>()

type Query = Array<string> | string
type WaitCfg = { callbackFn?: null | ((elm: Element) => void); root?: Element }

interface WaitRequest {
  path: Query[]
  cfg: WaitCfg
  resolve: (elm: Element) => void
  lastNotifiedIndex: number
}

// Find the first element that matches the query in the root element
const findInRoot = (root: Element, q: Query): Element | null => {
  const selectors = Array.isArray(q) ? q : [q]

  for (const selector of selectors) {
    const isDirect = selector.startsWith('>')
    const s = isDirect ? selector.slice(1) : selector

    const found = isDirect ? Array.from(root.children).find(c => c.matches(s)) : root.querySelector(s)
    if (found) return found
  }
  return null
}

// Process a request by finding the element in the root element and executing the callback
const processRequest = (req: WaitRequest): boolean => {
  let currentRoot = req.cfg.root || document.body
  if (!currentRoot) return false

  let latestFound: Element = null
  let stepIndex = 0

  for (const q of req.path) {
    const found = findInRoot(currentRoot, q)
    if (!found) break

    latestFound = found
    if (stepIndex > req.lastNotifiedIndex) {
      req.cfg.callbackFn?.(found)
      req.lastNotifiedIndex = stepIndex
    }

    currentRoot = found
    stepIndex++
  }

  if (stepIndex === req.path.length) {
    req.resolve(latestFound || currentRoot)
    return true
  }

  return false
}

// Process all pending requests
const processAll = () => {
  for (const req of pendingRequests) {
    if (processRequest(req)) {
      pendingRequests.delete(req)
    }
  }

  if (pendingRequests.size === 0) {
    stopObserver()
  }
}

const startObserver = () => {
  if (observer || !document.body) return
  observer = new MutationObserver(processAll)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'id']
  })
}

const stopObserver = () => {
  observer?.disconnect()
  observer = null
}

export function disobserve() {
  pendingRequests.clear()
  stopObserver()
}

// Observes the DOM for newly added nodes and executes a callback for each.
export const waitForElm = async (queries: Array<Query> | Query, cfg: Partial<WaitCfg> = {}): Promise<Element> => {
  const path: Query[] = Array.isArray(queries) && (queries.length === 0 || typeof queries[0] === 'string' || Array.isArray(queries[0])) ? (queries as Query[]) : ([queries] as Query[])

  return new Promise(resolve => {
    const req: WaitRequest = {
      path,
      cfg,
      resolve, // pass resolve to the observer
      lastNotifiedIndex: -1
    }

    if (processRequest(req)) return // elm already found

    pendingRequests.add(req)
    startObserver()

    const checkLogged = () => {
      if (pendingRequests.has(req)) {
        log(['The observer seems stuck looking for:', path, 'at root:', cfg.root || document.body], 'warn')
        setTimeout(checkLogged, 10000)
      }
    }
    setTimeout(checkLogged, 10000)
  })
}
