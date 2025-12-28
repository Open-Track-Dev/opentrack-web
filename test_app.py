import unittest
import os
import yaml
from app import load_events

class TestDataLoading(unittest.TestCase):
    def test_load_events(self):
        # Ensure data/events exists and has at least one file for testing
        events = load_events()
        self.assertIsInstance(events, list)
        if len(events) > 0:
            self.assertIn('title', events[0])
            self.assertIn('location', events[0])

if __name__ == '__main__':
    unittest.main()
