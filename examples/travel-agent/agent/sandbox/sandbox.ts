import { defineSandbox } from "../../../../src/sandbox.js";

export default defineSandbox({
  backend: "local",
  bootstrap: ["itineraries/.gitkeep"],
});
