import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, resolvePublicUrl } from "./public-article";
import { verifyAnalysis } from "./learning-grounding";

test("article fetch rejects private, loopback, mapped and reserved addresses",()=>{
  for (const address of ["127.0.0.1","10.0.0.2","172.16.0.1","192.168.1.2","169.254.169.254","0.0.0.0","100.64.0.1","224.0.0.1","::1","fc00::1","fe80::1","::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(address),false,address);
  }
  assert.equal(isPublicAddress("8.8.8.8"),true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"),true);
});
test("article URL rejects unsafe schemes, ports and userinfo",async()=>{
  for (const url of ["http://example.com","file:///etc/passwd","https://localhost","https://host.local","https://example.com:8443/","https://name:pass@example.com/","https://127.0.0.1/","https://[::1]/"]) {
    await assert.rejects(()=>resolvePublicUrl(url));
  }
});
const segments=[{id:"page-1",text:"تسخن الشمس مياه البحار فيتحول الماء إلى بخار. عندما يبرد البخار يتكاثف مكوّنًا السحب."}];
const reference={segmentId:"page-1",quote:"تسخن الشمس مياه البحار"};
const concept={key:"c1",title:"التبخر",description:"تحول الماء إلى بخار.",kind:"concept" as const,reference};
const question={conceptKey:"c1",prompt:"ما مصدر الحرارة؟",kind:"mcq" as const,choices:["الشمس","القمر"],correctChoice:0,answer:"الشمس",rubric:"",reference};
test("grounding keeps real Arabic quotes, removes hallucinated references and invalid MCQs",()=>{
  const result=verifyAnalysis({
    concepts:[concept,{...concept,key:"c2",reference:{...reference,quote:"اقتباس غير موجود إطلاقًا"}}],
    relations:[{fromKey:"c1",toKey:"c2",label:"علاقة",reference}],
    questions:[question,{...question,correctChoice:4},{...question,reference:{...reference,segmentId:"missing"}}],warnings:[],
  },segments);
  assert.equal(result.concepts.length,1);
  assert.equal(result.questions.length,1);
  assert.equal(result.relations.length,0);
  assert.match(result.warnings.join(" "),/حُذف 4/);
});
test("all ungrounded output is a failure, never a successful empty analysis",()=>{
  assert.throws(()=>verifyAnalysis({concepts:[{...concept,reference:{...reference,quote:"غير موجود بالمصدر"}}],relations:[],questions:[],warnings:[]},segments));
});
test("duplicate concept keys are rejected",()=>{
  assert.throws(()=>verifyAnalysis({concepts:[concept,concept],relations:[],questions:[],warnings:[]},segments));
});
test("Unicode and whitespace normalization does not erase meaningful wording",()=>{
  const result=verifyAnalysis({concepts:[{...concept,reference:{...reference,quote:"تسخن  الشمس\nمياه البحار"}}],relations:[],questions:[],warnings:[]},segments);
  assert.equal(result.concepts.length,1);
});