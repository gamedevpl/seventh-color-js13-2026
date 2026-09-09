import {parse} from 'acorn';

// Internal event/mode tags never cross the wire. Keep readable names in dev.
// rise/chg/fizzle have no production consumer; simulation effects stay intact.
export function compactEvents(source) {
  const tags=['join','knock','horn','graze','ignite','spend','lost','fell','blast','hurt','dead','boom'];
  const edits=[];
  const modes=['title','run','end'];
  const mode=n=>n?.type==='Identifier'&&/^mode[0-9]*$/.test(n.name);
  const member=n=>n?.type==='MemberExpression'&&!n.computed&&n.property.name==='k';
  function visit(n,parent) {
    if(!n||typeof n!=='object')return;
    if(n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='MemberExpression'&&n.expression.callee.object.name==='events'&&n.expression.callee.property.name==='push') {
      const tag=n.expression.arguments[0]?.properties?.find(p=>p.key.name==='k')?.value?.value;
      if(['rise','chg','fizzle'].includes(tag)) {edits.push([n.start,n.end,';']);return;}
    }
    const id=n.type==='Literal'?tags.indexOf(n.value):-1;
    if(id>=0 && (parent?.type==='Property'&&parent.value===n&&parent.key.name==='k' || parent?.type==='BinaryExpression'&&parent.right===n&&['===','!=='].includes(parent.operator)&&member(parent.left))) edits.push([n.start,n.end,String(id)]);
    const state=n.type==='Literal'?modes.indexOf(n.value):-1;
    if(state>=0 && (parent?.type==='VariableDeclarator'&&mode(parent.id) || parent?.type==='AssignmentExpression'&&mode(parent.left) || parent?.type==='BinaryExpression'&&parent.right===n&&['===','!=='].includes(parent.operator)&&mode(parent.left))) edits.push([n.start,n.end,String(state)]);
    for(const value of Object.values(n)) if(Array.isArray(value))value.forEach(v=>visit(v,n));else if(value&&typeof value==='object')visit(value,n);
  }
  visit(parse(source,{ecmaVersion:'latest'}));
  for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
  return source;
}
