import { Theme, ThemePanel, Button, Flex, Separator } from "@radix-ui/themes"
import * as React from "react"
import ServerHealthDashboard from "./ServerHealthDashboardThemes"

type Appearance = "light" | "dark" | "inherit"

export default function App() {
  const [appearance, setAppearance] = React.useState<Appearance>(() => {
    return (localStorage.getItem("appearance") as Appearance) || "light"
  })

  React.useEffect(() => {
    localStorage.setItem("appearance", appearance)
  }, [appearance])

  return (
    <Theme accentColor="sky" grayColor="sage" radius="full" panelBackground="translucent" appearance={appearance}>
      {/* opcionális élő preview panel:
      <ThemePanel /> 
      */}
      <Flex direction="column" p="3" gap="3">
        <Flex justify="between" align="center">
          <div style={{ fontWeight: 600 }}>Server Health Dashboard</div>
          <Flex gap="2" align="center">
            <Button size="1" variant="outline" onClick={() => setAppearance(a => a === "light" ? "dark" : "light")}>
              Toggle {appearance === "light" ? "Dark" : "Light"}
            </Button>
          </Flex>
        </Flex>
        <Separator size="4" />
        <ServerHealthDashboard defaultApiBase="http://localhost:8000" />
      </Flex>
    </Theme>
  )
}
