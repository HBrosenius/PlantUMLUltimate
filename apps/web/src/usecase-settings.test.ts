import { describe, expect, it } from "vitest";
import { parseUseCaseSettings, updateUseCaseSettings } from "./usecase-settings";

describe("Use Case settings", () => {
  it("parses layout, presentation, visibility, fonts, and colors", () => {
    const source = `@startuml
left to right direction
title Portal
caption Public functions
header Internal
footer %page%
skinparam packageStyle rectangle
skinparam shadowing false
skinparam monochrome true
skinparam handwritten true
hide stereotype
skinparam defaultFontName Inter
skinparam defaultFontSize 14
skinparam actorBackgroundColor #EFF6FF
skinparam usecaseBorderColor #2563EB
@enduml`;
    expect(parseUseCaseSettings(source)).toMatchObject({
      direction: "left-to-right",
      title: "Portal",
      caption: "Public functions",
      header: "Internal",
      footer: "%page%",
      packageStyle: "rectangle",
      shadowing: false,
      monochrome: true,
      handwritten: true,
      hideStereotypes: true,
      defaultFontName: "Inter",
      defaultFontSize: "14",
      actorBackgroundColor: "#EFF6FF",
      usecaseBorderColor: "#2563EB",
    });
  });

  it("updates managed settings without rewriting diagram objects or unrelated skinparams", () => {
    const source = `@startuml
top to bottom direction
title Old title
skinparam linetype ortho
skinparam actorBackgroundColor Red
actor Customer
(Order) as Order
Customer --> Order
@enduml`;
    const updated = updateUseCaseSettings(source, {
      ...parseUseCaseSettings(source),
      direction: "left-to-right",
      title: "Customer portal",
      actorBackgroundColor: "#LightBlue",
      usecaseBackgroundColor: "#LightGreen",
    });
    expect(updated).toContain("left to right direction\ntitle Customer portal");
    expect(updated).toContain("skinparam actorBackgroundColor #LightBlue");
    expect(updated).toContain("skinparam usecaseBackgroundColor #LightGreen");
    expect(updated).toContain("skinparam linetype ortho");
    expect(updated).toContain("actor Customer\n(Order) as Order\nCustomer --> Order");
    expect(updated).not.toContain("top to bottom direction");
    expect(updated).not.toContain("title Old title");
  });
});
