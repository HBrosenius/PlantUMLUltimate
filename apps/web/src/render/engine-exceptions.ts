/** TeaVM uses Java exceptions for routine parser control flow. Its generated
 * stack conversion is disabled (the frame factory returns null), yet creating
 * native errors still captures enormous data-URL stacks in WebKit. Keep Java
 * exception identity, messages and causes without those unused native stacks.
 * Other JavaScript errors retain their normal diagnostics.
 */
export function withoutJavaExceptionStacks(source: string): string {
  const constructor = "let self=Reflect.construct(Error,[void 0,cause],AJq);";
  const capture = 'if(typeof Error.captureStackTrace==="function"){Error.captureStackTrace(err);}';
  const disabledConversion = "DWv=(className,methodName,fileName,lineNumber)=>{{return null;}},DYg=(e,stack)=>{}";
  if (
    !source.includes(disabledConversion) ||
    source.split(constructor).length !== 2 ||
    source.split(capture).length !== 2
  )
    throw new Error("Unsupported PlantUML exception runtime; review the engine adapter before upgrading");
  return source
    .replace(
      constructor,
      'let self=Object.create(AJq.prototype);if(cause)Object.defineProperty(self,"cause",{value:cause.cause,configurable:true});',
    )
    .replace(capture, "");
}

export function classicEngineScript(source: string): string {
  const exports = "export{C as render,D as renderToString};";
  if (source.split(exports).length !== 2) throw new Error("Unsupported PlantUML module exports");
  return `(() => {\n${withoutJavaExceptionStacks(source).replace(exports, "globalThis.__plantumlRenderToString = D;")}\n})();`;
}
