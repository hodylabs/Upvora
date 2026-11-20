import { lazy, ComponentType } from "react"
import { NotYet } from "./shell/NotYet"

// Every page the new UI has built: public/ui2/pages/<Server page name>.tsx, e.g.
// "Home/Home.page" -> ./pages/Home/Home.page.tsx. The server names the page; a page
// not built yet shows NotYet inside the shell, so a site on the new look always works.
const built = require.context("./pages", true, /\.page\.tsx$/, "lazy")

const keyFor = (pageName: string) => `./${pageName}.tsx`

export const isBuilt = (pageName: string): boolean => built.keys().includes(keyFor(pageName))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pageFor = (pageName: string): ComponentType<any> => {
  if (!isBuilt(pageName)) {
    return NotYet
  }
  return lazy(() => built(keyFor(pageName)) as Promise<{ default: ComponentType<unknown> }>)
}
