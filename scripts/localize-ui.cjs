// One-time, reviewable source migration. It changes display copy, never IDs,
// routes, record names, form values, permission checks or stored quantities.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const write=process.argv.includes('--write');
const keys=new Set();
const fields=new Set(['title','detail','label','description','placeholder','submitLabel','note','accessibilityLabel']);
const files=['src/ui','src/app'].flatMap(folder=>fs.readdirSync(folder).filter(f=>f.endsWith('.tsx')).map(f=>folder+'/'+f)).filter(f=>!/(Typography|LanguageProvider)\.tsx$/.test(f));
files.push('src/ui/terminology.ts');
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const english=s=>/[A-Za-z]/.test(s)&&!/^([#/.]|https?:|[\w.+-]+@|ZV-|AUTO-|crewgrain-|Manrope)/.test(s)&&s!=='Crewgrain';
const report=[];
for(const file of files){
 const text=fs.readFileSync(file,'utf8'),sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let made=0,hook=false;const factories=new Set();
 const transformed=ts.transform(sf,[context=>{
  const f=context.factory;
  const call=(name,args)=>f.createCallExpression(f.createIdentifier(name),undefined,args);
  function remember(s){if(english(s))keys.add(s);}
  function display(n){
   if(!n)return n;
   if(ts.isStringLiteralLike(n)){remember(n.text);if(!english(n.text))return n;made++;return call('tr',[f.createStringLiteral(n.text)]);}
   if(ts.isTemplateExpression(n)){
    let key=n.head.text;const props=[];n.templateSpans.forEach((span,i)=>{key+='{{value'+i+'}}'+span.literal.text;props.push(f.createPropertyAssignment('value'+i,ts.visitNode(span.expression,visit)));});remember(key);if(!english(key.replace(/\{\{.*?\}\}/g,'')))return ts.visitEachChild(n,visit,context);made++;return call('tr',[f.createStringLiteral(key),f.createObjectLiteralExpression(props)]);
   }
   if(ts.isConditionalExpression(n))return f.updateConditionalExpression(n,ts.visitNode(n.condition,visit),n.questionToken,display(n.whenTrue),n.colonToken,display(n.whenFalse));
   if(ts.isParenthesizedExpression(n))return f.updateParenthesizedExpression(n,display(n.expression));
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken&&(ts.isStringLiteralLike(n.left)||ts.isStringLiteralLike(n.right)))return f.updateBinaryExpression(n,display(n.left),n.operatorToken,display(n.right));
   if(ts.isIdentifier(n)&&/^(error|serverError|accessError|linkError|emailError|passwordError|message)$/.test(n.text))return call('errorText',[n]);
   if(ts.isPropertyAccessExpression(n)&&n.name.text==='message')return call('errorText',[n]);
   if(ts.isPropertyAccessExpression(n)&&['status','attendance'].includes(n.name.text)){made++;return call('tr',[n]);}
   return ts.visitEachChild(n,visit,context);
  }
  function collect(n){
   if(ts.isStringLiteralLike(n))remember(n.text);
   if(ts.isTemplateExpression(n)){let s=n.head.text;n.templateSpans.forEach((x,i)=>{s+='{{value'+i+'}}'+x.literal.text});remember(s);}
  }
  function containsTr(n){let yes=false;function walk(x){if(ts.isCallExpression(x)&&ts.isIdentifier(x.expression)&&x.expression.text==='tr')yes=true;ts.forEachChild(x,walk)}walk(n);return yes;}
  function containsJsx(n){let yes=false;function walk(x){if(ts.isJsxElement(x)||ts.isJsxSelfClosingElement(x)||ts.isJsxFragment(x))yes=true;ts.forEachChild(x,walk)}walk(n);return yes;}
  function visit(n){
   if(ts.isCallExpression(n)&&['tr','errorText'].includes(n.expression.getText(sf))){if(n.expression.getText(sf)==='tr'&&n.arguments[0])collect(n.arguments[0]);return n;}
   if(ts.isNewExpression(n)&&n.expression.getText(sf)==='Error'&&n.arguments?.[0])collect(n.arguments[0]);
   if(ts.isCallExpression(n)&&/^(notify|setMessage|setError|setServerError|setLinkError|setEmailError|setPasswordError)$/.test(n.expression.getText(sf))&&n.arguments[0])collect(n.arguments[0]);
   if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['toLocaleDateString','toLocaleTimeString'].includes(n.expression.name.text)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text==='en-IN'){
    made++;return call(n.expression.name.text==='toLocaleDateString'?'formatDate':'formatTime',[ts.visitNode(n.expression.expression,visit),...n.arguments.slice(1).map(a=>ts.visitNode(a,visit))]);
   }
   if(ts.isJsxElement(n)){
    const tag=n.openingElement.tagName.getText(sf);
    const translatable=['Text','ReusableText','TableHead'].includes(tag);
    const children=n.children.map(child=>{
     if(translatable&&ts.isJsxText(child)){const s=child.text.replace(/\s+/g,' ').trim();if(english(s)){made++;remember(s);return f.createJsxExpression(undefined,call('tr',[f.createStringLiteral(s)]));}}
     if(translatable&&ts.isJsxExpression(child)&&child.expression)return f.updateJsxExpression(child,display(child.expression));
     return ts.visitNode(child,visit);
    });
    return f.updateJsxElement(n,ts.visitNode(n.openingElement,visit),children,n.closingElement);
   }
   if(ts.isJsxAttribute(n)&&fields.has(n.name.getText(sf))&&n.initializer){
    if(ts.isStringLiteral(n.initializer))return f.updateJsxAttribute(n,n.name,f.createJsxExpression(undefined,display(n.initializer)));
    if(ts.isJsxExpression(n.initializer)&&n.initializer.expression)return f.updateJsxAttribute(n,n.name,f.updateJsxExpression(n.initializer,display(n.initializer.expression)));
   }
   if(ts.isPropertyAssignment(n)&&fields.has(n.name.getText(sf).replace(/["']/g,'')))return f.updatePropertyAssignment(n,n.name,display(n.initializer));
   if(ts.isArrayLiteralExpression(n)){
    const tuple=n.elements.length>=2&&n.elements.length<=3&&ts.isStringLiteral(n.elements[0])&&ts.isStringLiteral(n.elements[1])&&/^[a-z][a-z-]*$/.test(n.elements[0].text)&&/^[A-Z]/.test(n.elements[1].text);
    if(tuple)return f.updateArrayLiteralExpression(n,n.elements.map((x,i)=>i===1?display(x):ts.visitNode(x,visit)));
    if(ts.isVariableDeclaration(n.parent)&&n.parent.name.getText(sf)==='ISSUES')return f.updateArrayLiteralExpression(n,n.elements.map(display));
   }
   if(ts.isVariableDeclaration(n)){
    let init=n.initializer?ts.visitNode(n.initializer,visit):n.initializer;
    const top=n.parent?.parent?.parent===sf;
    if(n.name.getText(sf)==='roleName'&&init&&ts.isArrowFunction(init))init=f.updateArrowFunction(init,init.modifiers,init.typeParameters,init.parameters,init.type,init.equalsGreaterThanToken,display(init.body));
    if(top&&init&&!ts.isArrowFunction(init)&&!ts.isFunctionExpression(init)&&((ts.isStringLiteralLike(n.initializer)&&/INFO|HELP|RULE/.test(n.name.getText(sf)))||containsTr(init))){
     if(ts.isStringLiteralLike(n.initializer))init=display(n.initializer);
     factories.add(n.name.getText(sf));return f.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type?f.createFunctionTypeNode(undefined,[],n.type):undefined,f.createArrowFunction(undefined,undefined,[],undefined,f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),ts.isObjectLiteralExpression(init)?f.createParenthesizedExpression(init):init));
    }
    return f.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,init);
   }
   if(ts.isFunctionDeclaration(n)&&n.body){
    const body=ts.visitNode(n.body,visit);if(n.name&&/^[A-Z]/.test(n.name.text)&&containsJsx(n.body)&&!body.statements.some(st=>st.getText?.(sf)?.includes('useTranslation('))){hook=true;return f.updateFunctionDeclaration(n,n.modifiers,n.asteriskToken,n.name,n.typeParameters,n.parameters,n.type,f.updateBlock(body,[f.createExpressionStatement(call('useTranslation',[])),...body.statements]));}
    return f.updateFunctionDeclaration(n,n.modifiers,n.asteriskToken,n.name,n.typeParameters,n.parameters,n.type,body);
   }
   return ts.visitEachChild(n,visit,context);
  }
  return root=>ts.visitNode(root,visit);
 }]).transformed[0];
 const final=ts.transform(transformed,[context=>{const f=context.factory;function visit(n){if(ts.isIdentifier(n)&&factories.has(n.text)){const p=n.parent;if(p&&(ts.isVariableDeclaration(p)&&p.name===n||ts.isPropertyAccessExpression(p)&&p.name===n||ts.isPropertyAssignment(p)&&p.name===n||ts.isTypeReferenceNode(p)))return n;return f.createCallExpression(f.createIdentifier(n.text),undefined,[]);}return ts.visitEachChild(n,visit,context);}return root=>ts.visitNode(root,visit);}]).transformed[0];
 let out=printer.printFile(final);
 const importPath='../lib/i18n';
 const names=['tr','errorText','formatDate','formatTime'].filter(name=>new RegExp('\\b'+name+'\\(').test(out)&&!new RegExp('import[^;]+\\b'+name+'\\b').test(out));
 if(names.length)out=`import {${names.join(',')}} from "${importPath}";\n`+out;
 if(hook&&!/import[^;]+useTranslation[^;]+from ["']react-i18next/.test(out))out='import {useTranslation} from "react-i18next";\n'+out;
 if(write)fs.writeFileSync(file,out);
 report.push({file,translatedSites:made,factories:[...factories]});
}
// Canonical errors remain in English in domain/store code and are translated at
// presentation. Include their templates and service messages in the same catalog.
for(const folder of ['src/domain','src/lib'])for(const name of fs.readdirSync(folder)){if(!/\.tsx?$/.test(name)||name.includes('.test.')||name==='i18n.ts')continue;const p=folder+'/'+name,s=fs.readFileSync(p,'utf8'),sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);function scan(n){if(ts.isNewExpression(n)&&n.expression.getText(sf)==='Error'&&n.arguments?.[0]){const a=n.arguments[0];if(ts.isStringLiteralLike(a)&&english(a.text))keys.add(a.text);if(ts.isTemplateExpression(a)){let key=a.head.text;a.templateSpans.forEach((span,i)=>key+='{{value'+i+'}}'+span.literal.text);keys.add(key);}}ts.forEachChild(n,scan)}scan(sf);}
function backend(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+file.name;if(file.isDirectory()){backend(p);continue;}const s=fs.readFileSync(p,'utf8');if(file.name.endsWith('.sql'))for(const m of s.matchAll(/raise\s+exception\s+'((?:''|[^'])*)'/gi)){let i=0;keys.add(m[1].replace(/''/g,"'").replace(/%/g,()=>`{{value${i++}}}`));}else if(file.name.endsWith('.ts')){const sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);function scan(n){if(ts.isPropertyAssignment(n)&&n.name.getText(sf)==='error'&&ts.isStringLiteralLike(n.initializer))keys.add(n.initializer.text);ts.forEachChild(n,scan)}scan(sf);}}}backend('supabase');
for(const key of ['Could not complete this action. Try again.','Labour cost','Line pay','Earnings','Language','Selected','January','February','March','April','May','June','July','August','September','October','November','December','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep','Sept','Oct','Nov','Dec','Sun','Mon','Tue','Wed','Thu','Fri','Sat','AM','PM','task','tasks','pieces','active','closed','pending','approved','rejected','present','absent','reviewed','submitted','needs_admin','admin_approved','accepted','void','weekly','monthly','all','Assigned'])keys.add(key);
const en=Object.fromEntries([...keys].sort().map(key=>[key,key]));
fs.mkdirSync('outputs/i18n',{recursive:true});fs.writeFileSync('outputs/i18n/source-migration-report.json',JSON.stringify(report,null,2));
if(write)fs.writeFileSync('src/locales/en.json',JSON.stringify(en,null,2)+'\n');
console.log(JSON.stringify({write,strings:keys.size,sites:report.reduce((n,x)=>n+x.translatedSites,0),factories:report.filter(x=>x.factories.length)},null,2));
