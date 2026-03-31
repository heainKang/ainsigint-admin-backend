// utils/jsonResponseUtil.js
// json값들 number -> string 으로 변환
export function toJsonWithStringNumbers(res, data) {
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(data, (_, value) =>
    typeof value === "number" ? value.toString() : value
  ));
}