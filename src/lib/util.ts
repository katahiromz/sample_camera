// 現在の日時の文字列を取得する(ローカル日時)
export const getLocalDateTimeString = () => {
  let d = new Date();
  d = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  let iso = d.toISOString();
  let yyyymmdd = iso.substring(0, 10);
  let hhmmss = iso.substring(11, 19);
  return yyyymmdd + ' ' + hhmmss;
};
