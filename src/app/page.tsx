import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <h1>人員每日出勤資料輸入介面</h1>
      <p className="hint">
        本次範圍：人員主檔、出勤類別字典、每日出勤表單填寫與班長／課長兩階段簽核。
        評分規則、帳號登入與角色授權驗證不在本次範圍。
      </p>
      <h2>快速連結</h2>
      <ul>
        <li>
          <Link href="/persons">人員主檔管理</Link>
        </li>
        <li>
          <Link href="/categories">出勤類別字典維護</Link>
        </li>
        <li>
          <Link href="/forms">出勤表單（班長模式：填寫／送審）</Link>
        </li>
        <li>
          <Link href="/forms?mode=supervisor">出勤表單（課長模式：核准／退回）</Link>
        </li>
      </ul>
    </div>
  );
}
