import type { ImportRow } from "./processing";
export const CATEGORIES=["Uncategorised","Sales","Commission income","Interest income","Salary","Refund","Office expenses","Utilities","Rent","Professional fees","Travel","Fuel","Groceries","Dining","Shopping","Insurance","Healthcare","Education","Taxes & GST","Bank charges","Internal transfer","Card settlement","Investment","Loan principal","Other income","Other expense"] as const;
const rules:{pattern:RegExp;category:string}[]=[
 {pattern:/\b(NEFT|IMPS|UPI)\b.*\b(SELF|OWN|TRANSFER TO OWN)\b|SELF TRANSFER/i,category:"Internal transfer"},
 {pattern:/CREDIT CARD PAYMENT|CARD SETTLEMENT|AUTOPAY.*CARD/i,category:"Card settlement"},
 {pattern:/SIP|MUTUAL FUND|NACH.*AMC|MF PURCHASE/i,category:"Investment"},
 {pattern:/GST PAYMENT|GST CHALLAN|INCOME TAX|ADVANCE TAX/i,category:"Taxes & GST"},
 {pattern:/SWIGGY|ZOMATO|RESTAURANT|CAFE|DOMINOS/i,category:"Dining"},
 {pattern:/PETROL|DIESEL|FUEL|HPCL|IOCL|BPCL/i,category:"Fuel"},
 {pattern:/ELECTRICITY|POWER BILL|WATER BILL|BROADBAND|AIRTEL|JIO/i,category:"Utilities"},
 {pattern:/UBER|OLA|IRCTC|AIRLINE|FLIGHT|HOTEL/i,category:"Travel"},
 {pattern:/GROCERY|DMART|BIGBASKET|ZEPTO|BLINKIT/i,category:"Groceries"},
 {pattern:/AMAZON|FLIPKART|MYNTRA/i,category:"Shopping"},
 {pattern:/INSURANCE PREMIUM|LIC PREMIUM|HEALTH PREMIUM/i,category:"Insurance"},
 {pattern:/BANK CHARGE|SMS CHARGE|ANNUAL FEE|SERVICE CHARGE/i,category:"Bank charges"},
 {pattern:/INTEREST CREDIT|SAVINGS INTEREST|FD INTEREST/i,category:"Interest income"},
 {pattern:/SALARY CREDIT|SALARY PAYMENT/i,category:"Salary"}
];
export function suggestCategory(row:Pick<ImportRow,"description"|"direction">):string{
 for(const rule of rules){if(rule.pattern.test(row.description))return rule.category}
 return "Uncategorised";
}
