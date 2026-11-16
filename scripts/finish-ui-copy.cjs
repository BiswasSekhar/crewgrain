const fs=require('fs'),ts=require('typescript');
let p='src/ui/Workflows.tsx',s=fs.readFileSync(p,'utf8').replace('`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`','tr("{{value0}} operations", { value0: tasks.length })').replace('notify("Person added.")','notify(tr("Employee added."))').replace('"Work approved."','"Day approved."');fs.writeFileSync(p,s);
p='src/ui/terminology.ts';s=fs.readFileSync(p,'utf8').replace('"Earnings"','"Pay"');fs.writeFileSync(p,s);
p='src/ui/Workflows.tsx';s=fs.readFileSync(p,'utf8');s=s.replace('summary={{ ...todayPay, pieces: total }}','summary={{ ...todayPay, pending: todayPay.pending + pending.reduce((sum, row) => sum + (row.delta ?? 0) * (countFor(d, row.assignmentId!, date)?.ratePaise ?? d.operations.find(o => o.id === row.operationId)?.ratePaise ?? 0), 0), pieces: total }}');fs.writeFileSync(p,s);
p='src/ui/Catalog.tsx';s=fs.readFileSync(p,'utf8').replace('go?.("people", { line });','go?.(isAdmin ? "people" : "team", { line });');fs.writeFileSync(p,s);
p='src/domain/operations.ts';s=fs.readFileSync(p,'utf8').replace('totalPieces: 0','totalPieces: 1000000').replace('if (!employee) throw new Error("Employee not found.");\n      if (!s.units','if (!employee || !employee.active) throw new Error("Restore the employee before changing role or line.");\n      if (!s.units');fs.writeFileSync(p,s);
// Keep long navigation labels contained at larger text sizes.
p='src/ui/AppShell.tsx';s=fs.readFileSync(p,'utf8').replace('minHeight: 58,','minHeight: 66,');s=s.replace('                        fontSize: 12,\n                        fontWeight: activeTab', '                        fontSize: 12,\n                        lineHeight: 17,\n                        textAlign: "center",\n                        maxWidth: "100%",\n                        flexShrink: 1,\n                        fontWeight: activeTab');fs.writeFileSync(p,s);
// Full-message templates and remaining fallback/menu/notification copy.
for(const file of fs.readdirSync('src/ui').filter(f=>f.endsWith('.tsx'))){
 const p='src/ui/'+file;if(file==='Typography.tsx'||file==='Brand.tsx')continue;
 let text=fs.readFileSync(p,'utf8'),sf=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),ed=[];
 function walk(n){
  if(ts.isTemplateExpression(n)){
   const parent=n.parent;const body=[n.head.text,...n.templateSpans.map(s=>s.literal.text)].join('');
   let forbidden=false;for(let x=n.parent;x;x=x.parent){if(ts.isJsxAttribute(x)&&['className','key','testID'].includes(x.name.getText(sf))){forbidden=true;break;}if(ts.isCallExpression(x)&&x.expression.getText(sf)==='tr'&&x.arguments[0]===n){forbidden=true;break;}}
   if(!forbidden&&/[A-Za-z]{2,}/.test(body)&&/\s/.test(body)){
    let key=n.head.text;const vals=[];n.templateSpans.forEach((span,i)=>{key+='{{value'+i+'}}'+span.literal.text;vals.push('value'+i+': '+span.expression.getText(sf));});
    ed.push([n.getStart(sf),n.end,'tr('+JSON.stringify(key)+', { '+vals.join(', ')+' })']);return;
   }
  }
  if(ts.isStringLiteral(n)){
   const parent=n.parent,value=n.text;
   if((ts.isCallExpression(parent)&&['notify','setMessage'].includes(parent.expression.getText(sf)))||
     (ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.QuestionQuestionToken&&parent.right===n&&/^[A-Z][a-z]/.test(value))||
     (ts.isConditionalExpression(parent)&&/^[A-Z][a-z]/.test(value))||
     (ts.isJsxAttribute(parent)&&['info','status'].includes(parent.name.getText(sf)))) {
      const canonical=value.replace(/\bTasks\b/g,'Operations').replace(/\bTask\b/g,'Operation').replace(/\btasks\b/g,'operations').replace(/\btask\b/g,'operation').replace(/^Work$/,'Operation').replace(/^Pieces logged$/,'Pieces done');
      ed.push([n.getStart(sf),n.end,'tr('+JSON.stringify(canonical)+')']);return;
   }
  }
  ts.forEachChild(n,walk);
 }
 walk(sf);for(const [a,b,v]of ed.sort((a,b)=>b[0]-a[0]))text=text.slice(0,a)+v+text.slice(b);fs.writeFileSync(p,text);
}
// Catalog menu copy is constructed inside the render and can localize there.
p='src/ui/Catalog.tsx';s=fs.readFileSync(p,'utf8');for(const phrase of ['Add many tasks','Paste a list: task name, seconds','Copy tasks from another style','Reuse a task list and price it for this style','Style pay rate','Edit style details','Code, name and category'])s=s.replace(JSON.stringify(phrase),'tr('+JSON.stringify(phrase.replace(/\btasks\b/g,'operations').replace(/\btask\b/g,'operation'))+')');fs.writeFileSync(p,s);
