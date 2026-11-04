import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import lekha.ledger_v2 as ledger

class LedgerTests(unittest.TestCase):
    def test_account_separation_and_duplicate_import(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(ledger,'DB',Path(directory)/'test.sqlite'):
                ledger.add_account('a','A','bank','personal')
                ledger.add_account('b','B','bank','business')
                rows=[{'date':'2026-10-01','description':'Same merchant','amount':'100.00','direction':'debit','category':'Food'}]*2
                self.assertEqual(ledger.import_transactions('a',rows,'file1'),(2,0))
                self.assertEqual(ledger.import_transactions('a',rows,'file1'),(0,2))
                self.assertEqual(ledger.import_transactions('b',rows,'file1'),(2,0))
                self.assertEqual(ledger.summary('2026-10-01','2026-10-31','personal')['expense'],200)
                self.assertEqual(ledger.summary('2026-10-01','2026-10-31','business')['expense'],200)

if __name__=='__main__':unittest.main()
