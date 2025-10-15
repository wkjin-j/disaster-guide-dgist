import React, { useMemo, useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Copy, Download, Info, Phone, Search, Share2, Siren, Printer, ListChecks, QrCode, Languages } from "lucide-react";
import QRCode from "qrcode";

/**
 * 재난대응 임무 안내 웹앱 – v1.3 (KR/EN + Self Tests + QR fix)
 * - FIX: Unexpected token 원인 제거 (잘못된 토큰 `| null>(null)` 삭제), QR 모달 오픈 시점에 캔버스 존재 확실화
 * - 입력: 부서, 이름, 직책 → 출력: "ㅇㅇㅇ(직책)님의 임무는 다음과 같습니다."(KR) / "The duty for ㅇㅇㅇ (title) is as follows."(EN)
 * - 기능: 비상연락망 검색/복사/통화, QR 생성/다운로드, 결과 복사/인쇄, KR/EN 토글
 */

// =========================
// ======== DATA ===========
// =========================

type Localized = { ko: string; en: string };

type Task = {
  title: Localized;
  steps: Localized[]; // 각 단계 KR/EN 지원
  note?: Localized;   // 선택
};

type DeptTasks = Record<string, Task>;

type Lang = "ko" | "en";

// 예시 데이터 — 실제 부서명/임무로 교체하세요. key는 드롭다운 표시명과 동일.
const DEPT_TASKS: DeptTasks = {
  "안전보안팀": {
    title: { ko: "재난대응 총괄 및 상황실 운영", en: "Overall response & Situation Room" },
    steps: [
      { ko: "상황전파 및 유관기관 공조 체계 가동", en: "Disseminate situation & activate inter-agency coordination" },
      { ko: "현장 통제 구역 설정·완료 보고", en: "Set control zones & report completion" },
      { ko: "피난 유도 및 인원 현황 취합", en: "Guide evacuation & compile headcount" },
      { ko: "훈련평가표/상황기록부 작성", en: "Complete drill evaluation & log" }
    ],
    note: { ko: "법정 훈련 문서 양식 사용(별지).", en: "Use statutory drill forms (annex)." }
  },
  "시설팀": {
    title: { ko: "전력·설비 안전조치 및 2차 피해 예방", en: "Utilities safety & secondary-damage prevention" },
    steps: [
      { ko: "전력·가스·공조 차단 여부 점검", en: "Verify power/gas/HVAC shutdown" },
      { ko: "소방설비 상태 확인", en: "Check fire systems (detection/alarm/sprinkler)" },
      { ko: "출입구·승강기 운용 통제 지원", en: "Support entrance/elevator control" },
      { ko: "복구 계획 수립 및 보고", en: "Draft recovery plan & report" }
    ]
  },
  "총무팀": {
    title: { ko: "지원 총괄 및 차량·물자 지원", en: "General support incl. vehicles/supplies" },
    steps: [
      { ko: "차량 통제 및 안내 인력 배치", en: "Deploy staff for traffic control" },
      { ko: "임시 집결지 물자 지원", en: "Supply assembly-point materials" },
      { ko: "외부 방문자/행사 인원 안내", en: "Guide visitors/event participants" },
      { ko: "사후 정산 및 기록 보관", en: "Post-drill settlement & records" }
    ]
  },
  "정보전산팀": {
    title: { ko: "비상 통신망 유지 및 시스템 알림", en: "Emergency comms & system notices" },
    steps: [
      { ko: "비상 알림 문자/푸시 발송 지원", en: "Support SMS/push alerts" },
      { ko: "상황실 네트워크/화상회의 지원", en: "Support network/video conference" },
      { ko: "서버·포털 공지 게시", en: "Post notices on servers/portal" },
      { ko: "복구 후 로그 아카이브", en: "Archive logs post-recovery" }
    ]
  }
};

// 비상연락망 예시 (부서/이름/직책/연락처). 실제 값으로 교체.
export type Contact = {
  dept: string;
  name: string;
  title: string;
  phone: string; // 예: 010-1234-5678
};

const EMERGENCY_CONTACTS: Contact[] = [
  { dept: "안전보안팀", name: "정욱진", title: "대리", phone: "010-0000-0000" },
  { dept: "안전보안팀", name: "홍길동", title: "팀장", phone: "010-1111-1111" },
  { dept: "시설팀", name: "김설비", title: "과장", phone: "010-2222-2222" },
  { dept: "총무팀", name: "이총무", title: "주임", phone: "010-3333-3333" },
  { dept: "정보전산팀", name: "박전산", title: "파트장", phone: "010-4444-4444" },
];

const DEPARTMENTS = Object.keys(DEPT_TASKS);

// 간단 i18n 사전
const STR = {
  appTitle: { ko: "재난대응 임무 안내", en: "Disaster Response Duty Guide" },
  trainingBadge: { ko: "훈련용", en: "For Drill" },
  print: { ko: "인쇄", en: "Print" },
  contacts: { ko: "비상연락망", en: "Emergency Contacts" },
  searchPlaceholder: { ko: "부서/이름/직책/번호 검색", en: "Search dept/name/title/phone" },
  dept: { ko: "부서", en: "Department" },
  name: { ko: "이름", en: "Name" },
  title: { ko: "직책", en: "Title" },
  selectDept: { ko: "부서를 선택하세요", en: "Select a department" },
  checkDuty: { ko: "임무 확인", en: "Check Duty" },
  reset: { ko: "초기화", en: "Reset" },
  infoLine: { ko: "임무는 부서 기준으로 안내됩니다. 이름/직책은 표시용입니다.", en: "Duties are mapped by department. Name/Title are for display only." },
  quickGuide: { ko: "빠른 비상 안내", en: "Quick Emergency Guide" },
  drillMode: { ko: "훈련일 전용 모드", en: "Drill-day mode" },
  quickBul1: { ko: "비상벨/경보 확인 후 지정 집결지로 신속 이동", en: "After alarm, move to designated assembly point" },
  quickBul2: { ko: "엘리베이터 사용 금지 · 계단 이용", en: "Do not use elevators; use stairs" },
  quickBul3: { ko: "출입통제 구역 준수 · 차량 이동 자제", en: "Respect control zones; minimize vehicle movement" },
  quickBul4: { ko: "안내 인력 지시에 따를 것", en: "Follow staff instructions" },
  copyLink: { ko: "현재 링크 복사", en: "Copy current link" },
  deptLabel: { ko: "부서:", en: "Department:" },
  copyResult: { ko: "결과 복사", en: "Copy Result" },
  printSave: { ko: "인쇄/저장", en: "Print/Save" },
  notSelected: { ko: "(미선택)", en: "(not selected)" },
  selectDeptHint: { ko: "부서를 선택하면 해당 부서 임무가 표시됩니다.", en: "Select a department to view its duty." },
  privacy1: { ko: "※ 본 앱은 이름·직책을 화면 표시용으로만 사용하며 서버에 저장하지 않는 정적 클라이언트 앱입니다.", en: "※ This app does not store personal data; it's a static client-only app." },
  dataManage: { ko: "※ 데이터 관리: 부서별 임무/연락망은 코드 상수 또는 JSON로 교체 가능합니다.", en: "※ Data: duties/contacts can be edited in code constants or external JSON." },
  deploy: { ko: "※ 배포: GitHub Pages, Netlify 등 정적 호스팅에 업로드 후 URL을 QR로 게시하세요.", en: "※ Deploy: host on GitHub Pages/Netlify and post the URL via QR." },
  qr: { ko: "접속용 QR 코드", en: "Access QR Code" },
  qrSave: { ko: "PNG 저장", en: "Save PNG" },
  qrNote: { ko: "배포 후 최종 URL에서 다시 생성하면 정확합니다.", en: "Re-generate after final URL for accuracy." },
};

// =========================
// ===== Helpers & Tests ====
// =========================

// header 문구 생성 로직을 함수로 분리(테스트 용이)
function formatHeader(name: string, title: string, lang: Lang): string {
  const displayName = name && title ? `${name} (${title})` : name || title ? `${name || title}` : "";
  if (!displayName) return "";
  return lang === "ko"
    ? `${displayName}님의 임무는 다음과 같습니다.`
    : `The duty for ${displayName} is as follows.`;
}

// 개발 환경에서만 간단한 런타임 self-test 실행
function runSelfTests() {
  try {
    // 1) Header 생성 테스트 (KR/EN)
    console.assert(
      formatHeader("홍길동", "팀장", "ko") === "홍길동 (팀장)님의 임무는 다음과 같습니다.",
      "[TEST] formatHeader ko failed"
    );
    console.assert(
      formatHeader("Alex Kim", "Manager", "en") === "The duty for Alex Kim (Manager) is as follows.",
      "[TEST] formatHeader en failed"
    );

    // 1-추가) Header 생성: 이름만, 직책만, 공백
    console.assert(
      formatHeader("홍길동", "", "ko") === "홍길동님의 임무는 다음과 같습니다.",
      "[TEST] formatHeader ko (name only) failed"
    );
    console.assert(
      formatHeader("", "팀장", "ko") === "팀장님의 임무는 다음과 같습니다.",
      "[TEST] formatHeader ko (title only) failed"
    );
    console.assert(
      formatHeader("", "", "ko") === "",
      "[TEST] formatHeader empty failed"
    );

    // 2) 개행 조립 테스트 (join("\n"))
    const joined = ["a", "b", "c"].join("\n");
    console.assert(joined.split("\n").length === 3, "[TEST] newline join failed");

    // 3) 연락망 검색 가능성(간단) 테스트
    const hasHong = EMERGENCY_CONTACTS.some(c => [c.dept, c.name, c.title, c.phone].some(v => v.toLowerCase().includes("홍길동".toLowerCase())));
    console.assert(hasHong, "[TEST] contacts search existence failed");

    // 4) Localized 폴백 동작 테스트
    const loc: Localized = { ko: "한국어", en: "" };
    const getLocalizedTest = (l: Localized | undefined, lang: Lang) => (l ? l[lang] || l.ko : "");
    console.assert(getLocalizedTest(loc, "en") === "한국어", "[TEST] localized fallback failed");

    // 5) 부서 목록 적어도 1개
    console.assert(Object.keys(DEPT_TASKS).length > 0, "[TEST] dept list should not be empty");

    // eslint-disable-next-line no-console
    console.log("[SelfTests] All passed ✔");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[SelfTests] Skipped or failed:", e);
  }
}

// =========================
// ====== COMPONENT =========
// =========================

export default function DisasterDutyHelper() {
  const [lang, setLang] = useState<Lang>("ko");
  const t = (k: keyof typeof STR) => STR[k][lang];

  const [dept, setDept] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [resultOpen, setResultOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrOpen, setQrOpen] = useState<boolean>(false);

  const task: Task | undefined = useMemo(() => (dept ? DEPT_TASKS[dept] : undefined), [dept]);

  const headerLine = useMemo(() => formatHeader(name, title, lang), [name, title, lang]);

  // QR: 현재 페이지 URL 기준으로 생성 (배포 후 해당 URL로 접속).
  const makeQr = async () => {
    try {
      const url = window.location.href;
      const canvas = qrCanvasRef.current;
      if (!canvas) return;
      await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: "H", width: 220, margin: 1 });
      const dataUrl = canvas.toDataURL("image/png");
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    runSelfTests();
  }, []);

  // QR 다이얼로그가 열릴 때 캔버스가 DOM에 존재하므로, 그 시점에 생성
  useEffect(() => {
    if (qrOpen) {
      const id = requestAnimationFrame(() => makeQr());
      return () => cancelAnimationFrame(id);
    }
  }, [qrOpen]);

  const filteredContacts = useMemo(() => {
    const q = search.trim();
    if (!q) return EMERGENCY_CONTACTS;
    return EMERGENCY_CONTACTS.filter(c =>
      [c.dept, c.name, c.title, c.phone].some(v => v.toLowerCase().includes(q.toLowerCase()))
    );
  }, [search]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(lang === "ko" ? "복사되었습니다." : "Copied.");
    } catch {
      alert(lang === "ko" ? "복사 실패. 브라우저 권한을 확인하세요." : "Copy failed. Check browser permissions.");
    }
  };

  const printPage = () => window.print();

  const getLocalized = (l: Localized | undefined) => (l ? l[lang] || l.ko : "");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/50 border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Siren className="w-6 h-6" />
            <span className="font-semibold">{t('appTitle')}</span>
            <Badge variant="secondary" className="ml-2">{t('trainingBadge')}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <div className="flex items-center gap-1 mr-2">
              <Languages className="w-4 h-4"/>
              <Button variant={lang==='ko'? 'default':'outline'} size="sm" onClick={() => setLang('ko')}>KR</Button>
              <Button variant={lang==='en'? 'default':'outline'} size="sm" onClick={() => setLang('en')}>EN</Button>
            </div>

            <Button variant="outline" size="sm" onClick={printPage}><Printer className="w-4 h-4 mr-1"/>{t('print')}</Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm"><Phone className="w-4 h-4 mr-1"/>{t('contacts')}</Button>
              </SheetTrigger>
              <SheetContent className="w-[420px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle>{t('contacts')}</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-4 h-4"/>
                    <Input placeholder={t('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <ScrollArea className="h-[60vh] pr-3">
                    <div className="space-y-2">
                      {filteredContacts.map((c, idx) => (
                        <Card key={`${c.dept}-${c.name}-${idx}`} className="shadow-sm">
                          <CardContent className="py-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-medium">{c.name} <span className="text-slate-500">({c.title})</span></div>
                                <div className="text-sm text-slate-600">{c.dept}</div>
                                <div className="text-sm mt-1">{c.phone}</div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="icon" onClick={() => copyText(c.phone)} title={lang==='ko'? '번호 복사':'Copy number'}><Copy className="w-4 h-4"/></Button>
                                <a href={`tel:${c.phone.replace(/-/g, "")}`}>
                                  <Button size="icon" title={lang==='ko'? '전화 걸기':'Call'}><Phone className="w-4 h-4"/></Button>
                                </a>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </SheetContent>
            </Sheet>
            <Dialog open={qrOpen} onOpenChange={setQrOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><QrCode className="w-4 h-4 mr-1"/>QR</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('qr')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3 py-2">
                  <canvas ref={qrCanvasRef} className="bg-white p-2 rounded"/>
                  {qrDataUrl && (
                    <a href={qrDataUrl} download={`duty-helper-qr.png`}>
                      <Button><Download className="w-4 h-4 mr-1"/>{STR.qrSave[lang]}</Button>
                    </a>
                  )}
                  <p className="text-xs text-slate-500">{STR.qrNote[lang]}</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="mb-1 block">{STR.dept[lang]}</Label>
                  <Select value={dept} onValueChange={setDept}>
                    <SelectTrigger>
                      <SelectValue placeholder={STR.selectDept[lang]} />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">{STR.name[lang]}</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder={lang==='ko'? '예: 홍길동':'e.g., Alex Kim'} />
                  </div>
                  <div>
                    <Label className="mb-1 block">{STR.title[lang]}</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={lang==='ko'? '예: 팀장':'e.g., Manager'} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="" onClick={() => setResultOpen(true)} disabled={!dept}>
                    <ListChecks className="w-4 h-4 mr-1"/>{STR.checkDuty[lang]}
                  </Button>
                  <Button variant="outline" onClick={() => { setDept(""); setName(""); setTitle(""); }}>{STR.reset[lang]}</Button>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <Info className="w-3 h-3"/> {STR.infoLine[lang]}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{STR.quickGuide[lang]}</div>
                  <Badge variant="outline">{STR.drillMode[lang]}</Badge>
                </div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>{STR.quickBul1[lang]}</li>
                  <li>{STR.quickBul2[lang]}</li>
                  <li>{STR.quickBul3[lang]}</li>
                  <li>{STR.quickBul4[lang]}</li>
                </ul>
                <div className="pt-2">
                  <Button variant="outline" onClick={() => copyText(window.location.href)}>
                    <Share2 className="w-4 h-4 mr-1"/>{STR.copyLink[lang]}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 결과 영역 */}
        {resultOpen && (
          <section className="mt-8 print:mt-0">
            <Card className="shadow-md border-2 border-slate-200">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-semibold">
                      {headerLine || (lang==='ko' ? "이름(직책) 정보를 입력하면 상단에 표시됩니다." : "Enter Name/Title to see the header.")}
                    </div>
                    <div className="text-slate-600 text-sm">{STR.deptLabel?.[lang] ?? (lang==='ko' ? '부서:' : 'Department:')} <span className="font-medium">{dept || STR.notSelected[lang]}</span></div>
                  </div>

                  {task ? (
                    <div className="space-y-3">
                      <div className="text-base font-semibold">● {getLocalized(task.title)}</div>
                      <ol className="list-decimal pl-5 space-y-1">
                        {task.steps.map((s, i) => (<li key={i}>{getLocalized(s)}</li>))}
                      </ol>
                      {task.note && (
                        <div className="text-sm text-slate-600">※ {getLocalized(task.note)}</div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" onClick={() => {
                          const text = `${headerLine}\n${(STR.deptLabel?.[lang] ?? (lang==='ko' ? '부서:' : 'Department:'))} ${dept}\n- ${getLocalized(task.title)}\n${task.steps.map((s,i)=>`${i+1}. ${getLocalized(s)}`).join("\n")}\n${task.note?`※ ${getLocalized(task.note)}`:""}`;
                          copyText(text);
                        }}><Copy className="w-4 h-4 mr-1"/>{STR.copyResult[lang]}</Button>
                        <Button onClick={printPage}><Printer className="w-4 h-4 mr-1"/>{STR.printSave[lang]}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">{STR.selectDeptHint[lang]}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* 하단 정보 */}
        <div className="mt-10 text-xs text-slate-500 flex flex-col gap-1">
          <div>{STR.privacy1[lang]}</div>
          <div>{STR.dataManage[lang]}</div>
          <div>{STR.deploy[lang]}</div>
        </div>
      </main>

      <footer className="mt-10 border-t">
        <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-slate-500 flex items-center justify-between">
          <span>© {new Date().getFullYear()} DGIST (예시). {lang==='ko'? '훈련용 내부 안내':'Internal guide for drill'}.</span>
          <span>v1.3 · {lang==='ko'? '문의: 안전보안팀':'Contact: Safety & Security Team'}</span>
        </div>
      </footer>
    </div>
  );
}
