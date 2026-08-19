import React from "react";
import { createRoot } from "react-dom/client";
import QuizApp from "./app/QuizApp";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <QuizApp />
  </React.StrictMode>,
);
