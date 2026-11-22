import sqlite3
import tempfile
import unittest
from pathlib import Path

from lekha import accounting as a


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "books.sqlite"
        a.create_book("b","Business","business",path=self.db)
        a.create_book("p","Personal","personal",path=self.db)
        a.create_account("bank","b","Bank","asset",path=self.db)
        a.create_account("sales","b","Sales","income",path=self.db)
        a.create_account("pbank","p","Personal bank","asset",path=self.db)

    def test_balanced_journal(self):
        a.post_journal("j1","b","2026-11-22","Income",
                       [("bank","100",0),("sales",0,"100")],path=self.db)
        trial=a.trial_balance("b",path=self.db)
        self.assertEqual(sum(x["debit_paise"]-x["credit_paise"] for x in trial),0)
        self.assertEqual(sum(x["debit_paise"] for x in trial),10000)

    def test_unbalanced_rollback(self):
        with self.assertRaises(ValueError):
            a.post_journal("bad","b","2026-11-22","Wrong",
                           [("bank",100,0),("sales",0,99)],path=self.db)
        self.assertEqual(sum(x["debit_paise"] for x in a.trial_balance("b",path=self.db)),0)

    def test_prevent_cross_book(self):
        with self.assertRaises(ValueError):
            a.post_journal("cross","b","2026-11-22","Wrong",
                           [("pbank",100,0),("sales",0,100)],path=self.db)

    def test_reverse_and_closed_period(self):
        a.post_journal("j1","b","2026-10-15","Income",
                       [("bank",10,0),("sales",0,10)],path=self.db)
        a.close_period("b","2026-10",path=self.db)
        with self.assertRaises(ValueError):
            a.reverse_journal("j1","rev","2026-10-16","error",path=self.db)
        a.reverse_journal("j1","rev","2026-11-22","error",path=self.db)
        self.assertTrue(all(x["debit_paise"]==x["credit_paise"] for x in a.trial_balance("b",path=self.db)))

    def test_duplicate_statement_and_separate_accounts(self):
        raw=b"date,description,amount,direction\n2026-11-22,test,100,credit\n"
        records=[{"date":"2026-11-22","description":"test","amount":100,"direction":"credit"}]
        self.assertEqual(a.stage_statement("b","bank","sample.csv",raw,records,path=self.db),(1,0))
        self.assertEqual(a.stage_statement("b","bank","sample.csv",raw,records,path=self.db),(0,1))
        self.assertEqual(len(a.list_staged("b",path=self.db)),1)
        self.assertEqual(len(a.list_staged("p",path=self.db)),0)

    def test_gstr2b_match_not_automatic_eligibility(self):
        for role in ("purchase","gstr2b"):
            a.add_invoice(role,"b",role,"24ABCDE1234F1Z5","001","2026-11-20",100,9,9,
                          path=self.db)
        result=a.reconcile_gstr2b("b",path=self.db)
        self.assertEqual(result[0]["status"],"matched")
        self.assertEqual(result[0]["eligibility"],"review_required")

    def test_gstr2b_amount_mismatch(self):
        a.add_invoice("inv1","b","purchase","24ABCDE1234F1Z5","001","2026-11-20",100,9,9,path=self.db)
        a.add_invoice("inv2","b","gstr2b","24ABCDE1234F1Z5","001","2026-11-20",100,8,9,path=self.db)
        self.assertEqual(a.reconcile_gstr2b("b",path=self.db)[0]["status"],"amount_mismatch")

    def test_legacy_schema_unmodified(self):
        with sqlite3.connect(self.db) as conn:
            cols=[r[1] for r in conn.execute("PRAGMA table_info(txns)")]
        # The new accounting engine must not require changing the legacy txns table.
        self.assertNotIn("book_id",cols)


if __name__ == "__main__":
    unittest.main()
