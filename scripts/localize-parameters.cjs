const fs=require('fs'),ts=require('typescript');
const en=JSON.parse(fs.readFileSync('src/locales/en.json','utf8'));
for(const file of fs.readdirSync('src/ui').filter(f=>f.endsWith('.tsx')&&!['Typography.tsx','LanguageProvider.tsx'].includes(f))){
 const path='src/ui/'+file,source=fs.readFileSync(path,'utf8'),sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let touched=false;
 const output=ts.transform(sf,[context=>{const f=context.factory;
 function localized(n){
  if(ts.isStringLiteralLike(n)&&/[A-Za-z]/.test(n.text)&&n.text!=='s'&&!/^ZV-/.test(n.text)){touched=true;en[n.text]??=n.text;return f.createCallExpression(f.createIdentifier('tr'),undefined,[f.createStringLiteral(n.text)]);}
  if(ts.isConditionalExpression(n))return f.updateConditionalExpression(n,n.condition,n.questionToken,localized(n.whenTrue),n.colonToken,localized(n.whenFalse));
  if(ts.isTemplateExpression(n)&&/[A-Za-z]/.test(n.head.text+n.templateSpans.map(s=>s.literal.text).join(''))){let key=n.head.text;const values=[];n.templateSpans.forEach((span,i)=>{key+='{{value'+i+'}}'+span.literal.text;values.push(f.createPropertyAssignment('value'+i,localized(span.expression)));});en[key]??=key;touched=true;return f.createCallExpression(f.createIdentifier('tr'),undefined,[f.createStringLiteral(key),f.createObjectLiteralExpression(values)]);}
  return n;
 }
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='tr'&&n.arguments[1]&&ts.isObjectLiteralExpression(n.arguments[1]))return f.updateCallExpression(n,n.expression,n.typeArguments,[n.arguments[0],f.updateObjectLiteralExpression(n.arguments[1],n.arguments[1].properties.map(p=>ts.isPropertyAssignment(p)?f.updatePropertyAssignment(p,p.name,localized(p.initializer)):p))]);
  if(ts.isBindingElement(n)&&['label','title','placeholder','note','description'].includes(n.name.getText(sf))&&n.initializer&&ts.isStringLiteral(n.initializer))return f.updateBindingElement(n,n.dotDotDotToken,n.propertyName,n.name,localized(n.initializer));
  if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(sf)==='TextButton'&&!n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(sf)==='destructive')){const label=n.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(sf)==='label');const expr=label?.initializer&&ts.isJsxExpression(label.initializer)?label.initializer.expression:undefined;const key=expr&&ts.isCallExpression(expr)&&expr.arguments[0]&&ts.isStringLiteral(expr.arguments[0])?expr.arguments[0].text:'';if(/^(Remove|Delete|Revoke)/i.test(key)){touched=true;return f.updateJsxSelfClosingElement(n,n.tagName,n.typeArguments,f.updateJsxAttributes(n.attributes,[...n.attributes.properties,f.createJsxAttribute(f.createIdentifier('destructive'),undefined)]));}}
  return ts.visitEachChild(n,visit,context);
 }return root=>ts.visitNode(root,visit);}]).transformed[0];
 if(touched)fs.writeFileSync(path,ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(output));
}
fs.writeFileSync('src/locales/en.json',JSON.stringify(en,null,2)+'\n');
