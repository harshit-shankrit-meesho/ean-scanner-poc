import React from "react";
import "./tailwind.output.css";
import { Route } from "react-router-dom";
import Scanners from "./Scanners";
import { Switch } from "react-router-dom/cjs/react-router-dom.min";

export default function App() {
  return (
    <Switch>
      <Route path="/*" component={Scanners} />
    </Switch>
  );
}
