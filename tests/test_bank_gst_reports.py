import tempfile
import unittest
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile

from lekha import accounting as a
from lekha import reconciliation as rec
from lekha import gst_reports as gst


class BankGSTTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.db=Path(temp.name)/"books.sqlite"
        a.create_book("business","Business","business","24ABCDE1234F1Z5",self.db)
        a.create_book("personal","Personal","personal",path=self.db)
        a.create_account("bank","business","Current Account","asset",self.db)
        a.create_account("income","business","Sales Income","income",self.db)
        a.create_account("other","business","Other Bank","asset",self.db)
        a.create_account("personalbank","personal","Personal bank","asset",self.db)

    def _stage(self, account="bank", amount="100.00", name="bank.csv"):
        rows=[{"date":"2026-11-15","description":"Customer receipt",
               "amount":amount,"direction":"credit","reference":"TX-1"}]
        raw=(name+amount).encode()
        a.stage_statement("business",account,name,raw,rows,path=self.db)
        records=rec.statement_status("business",path=self.db,account_id=account)
        return records[-1]["line_id"]

    def test_reconcile_and_undo(self):
        line=self._stage()
        a.post_journal("receipt","business","2026-11-15","Customer paid",
                       [("bank",100,0),("income",0,100)],path=self.db)
        self.assertEqual(rec.allocate(line,"receipt",6000,path=self.db),6000)
        self.assertEqual(rec.statement_status("business",self.db)[0]["remaining_paise"],4000)
        with self.assertRaises(ValueError):
            rec.allocate(line,"receipt",5000,path=self.db)
        rec.undo(line,"receipt",path=self.db)
        self.assertEqual(rec.statement_status("business",self.db)[0]["status"],"unmatched")

    def test_cross_book_journal_rejected(self):
        line=self._stage()
        a.create_account("pcapital","personal","Personal capital","equity",self.db)
        a.post_journal("p1","personal","2026-11-15","Personal",
                       [("personalbank",100,0),("pcapital",0,100)],path=self.db)
        with self.assertRaises(ValueError):
            rec.allocate(line,"p1",path=self.db)

    def test_balance_check(self):
        self._stage()
        with rec._db(self.db) as con:
            source=con.execute("SELECT import_id FROM statement_imports").fetchone()[0]
        result=rec.balance_check(source,10000,20000,path=self.db)
        self.assertTrue(result["balanced"])
        self.assertEqual(result["difference_paise"],0)

    def test_gst_draft_zip_with_explicit_not_filing_warning(self):
        a.add_invoice("s1","business","sale","24ABCDE1234F1Z5","SALE-1",
                      "2026-11-15",100,9,9,path=self.db)
        a.add_invoice("p1","business","purchase","24ABCDE1234F1Z5","PUR-1",
                      "2026-11-16",100,9,9,eligible_itc="eligible",path=self.db)
        a.add_invoice("g1","business","gstr2b","24ABCDE1234F1Z5","PUR-1",
                      "2026-11-16",100,9,9,path=self.db)
        report=gst.draft_gst_workpapers("business","2026-11",path=self.db)
        self.assertEqual(report["summary"]["sales_invoices"],1)
        self.assertEqual(report["summary"]["matched_and_marked_eligible_itc_paise"]["cgst_paise"],900)
        self.assertIsNone(report["summary"]["tax_payable_paise"])
        self.assertFalse(report["summary"]["gst_return_ready"])
        payload=gst.export_workpapers_zip("business","2026-11",path=self.db)
        with ZipFile(BytesIO(payload)) as z:
            self.assertIn("summary.json",z.namelist())
            self.assertIn(b"NOT",z.read("READ_FIRST_NOT_FOR_FILING.txt"))

    def test_gst_ineligible_not_claimed(self):
        a.add_invoice("p1","business","purchase","24ABCDE1234F1Z5","PUR-1",
                      "2026-11-16",100,9,9,eligible_itc="ineligible",path=self.db)
        a.add_invoice("g1","business","gstr2b","24ABCDE1234F1Z5","PUR-1",
                      "2026-11-16",100,9,9,path=self.db)
        report=gst.draft_gst_workpapers("business","2026-11",path=self.db)
        self.assertEqual(report["summary"]["matched_and_marked_eligible_itc_paise"]["cgst_paise"],0)

    def test_wrong_month_excluded(self):
        a.add_invoice("s1","business","sale","24ABCDE1234F1Z5","SALE-1",
                      "2026-10-15",100,9,9,path=self.db)
        report=gst.draft_gst_workpapers("business","2026-11",path=self.db)
        self.assertEqual(report["summary"]["sales_invoices"],0)

if __name__=="__main__":
    unittest.main()
