import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <h1>人員每日出勤資料輸入介面</h1>
      <p className="hint">
        每日出勤表單填寫與班長／開發者兩階段簽核，人員主檔、出勤類別、積分規則與帳號等設定項目統一收在「功能設定」，登入身分依角色決定可存取的頁面與操作。
      </p>
      <h2>快速連結</h2>
      <ul>
        <li>
          <Link href="/forms">出勤表單（班長模式：填寫／送審）</Link>
        </li>
        <li>
          <Link href="/forms?mode=supervisor">出勤表單（開發者模式：核准／退回）</Link>
        </li>
        <li>
          <Link href="/settings">功能設定（人員主檔／類別管理／積分規則設定／帳號管理）</Link>
        </li>
        <li>
          <Link href="/board">員工分數查詢（免登入，可分享給現場平板）</Link>
        </li>
      </ul>
    </div>
  );
}
